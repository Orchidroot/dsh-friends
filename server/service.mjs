import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, createHash, randomUUID } from 'node:crypto';
import { mkdirSync, chmodSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = fileURLToPath(new URL('../web/', import.meta.url));
const STATES = new Set(['online', 'away', 'busy', 'invisible']);
const hash = (value) => createHash('sha256').update(value).digest('hex');
class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = (status, message) => { throw new HttpError(status, message); };

/** One process, one SQLite database. Presence is deliberately ephemeral. */
export function createFriendsService(options = {}) {
  const database = options.database ?? resolve('data/friends.sqlite');
  const clock = options.clock ?? Date.now;
  const ttl = options.presenceTtl ?? 45_000;
  const publicOrigin = options.publicOrigin ? new URL(options.publicOrigin).origin : null;
  const maxUsers = options.maxUsers ?? 10_000;
  const signupCode = options.signupCode ?? '';
  const frames = options.frameAncestors ?? "'self' http://127.0.0.1:* http://localhost:*";
  if (/[;\r\n]/.test(frames)) throw new Error('Invalid frameAncestors');
  if (database !== ':memory:') mkdirSync(dirname(database), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(database);
  db.exec(`PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, code TEXT UNIQUE NOT NULL,
      token_hash TEXT UNIQUE NOT NULL, created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS friends (
      a TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      b TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      PRIMARY KEY(a,b), CHECK(a < b)
    );
    CREATE TABLE IF NOT EXISTS requests (
      id TEXT PRIMARY KEY,
      from_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      to_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL, UNIQUE(from_id,to_id)
    );
    CREATE INDEX IF NOT EXISTS requests_to ON requests(to_id);
    CREATE INDEX IF NOT EXISTS friends_b ON friends(b);
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      to_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body TEXT NOT NULL, created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS messages_pair ON messages(from_id, to_id, id);
    CREATE INDEX IF NOT EXISTS messages_to ON messages(to_id, id);
    CREATE TABLE IF NOT EXISTS transfers (
      code_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS reads (
      reader TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      peer TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      last_read INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(reader, peer)
    );`);
  // Additive migrations for databases created by 0.1.0.
  // Run inside one write transaction so two processes starting on the same file cannot both ALTER.
  db.exec('BEGIN IMMEDIATE');
  try {
    const columns = new Set(db.prepare('PRAGMA table_info(users)').all().map((c) => c.name));
    if (!columns.has('message')) db.exec("ALTER TABLE users ADD COLUMN message TEXT NOT NULL DEFAULT ''");
    if (!columns.has('last_seen')) db.exec('ALTER TABLE users ADD COLUMN last_seen INTEGER');
    if (!columns.has('avatar')) db.exec("ALTER TABLE users ADD COLUMN avatar TEXT NOT NULL DEFAULT ''");
    if (!columns.has('avatar_at')) db.exec('ALTER TABLE users ADD COLUMN avatar_at INTEGER NOT NULL DEFAULT 0');
    if (!columns.has('labels')) db.exec("ALTER TABLE users ADD COLUMN labels TEXT NOT NULL DEFAULT ''");
    const transferColumns = new Set(db.prepare('PRAGMA table_info(transfers)').all().map((c) => c.name));
    if (!transferColumns.has('mode')) db.exec("ALTER TABLE transfers ADD COLUMN mode TEXT NOT NULL DEFAULT 'move'");
    if (!transferColumns.has('blob')) db.exec("ALTER TABLE transfers ADD COLUMN blob TEXT NOT NULL DEFAULT ''");
    if (!transferColumns.has('salt')) db.exec("ALTER TABLE transfers ADD COLUMN salt TEXT NOT NULL DEFAULT ''");
    const messageColumns = new Set(db.prepare('PRAGMA table_info(messages)').all().map((c) => c.name));
    if (!messageColumns.has('client_id')) db.exec('ALTER TABLE messages ADD COLUMN client_id TEXT');
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS message_retry ON messages(from_id, client_id) WHERE client_id IS NOT NULL');
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
  if (database !== ':memory:' && process.platform !== 'win32') chmodSync(database, 0o600);
  const leases = new Map(); // user -> device -> {status, at}
  const limits = new Map();
  const streams = new Map();
  let closing = false;
  const userView = (u) => ({ id: u.id, name: u.name, code: u.code });
  const ordered = (a, b) => a < b ? [a, b] : [b, a];
  const related = (a, b) => db.prepare('SELECT 1 FROM friends WHERE a=? AND b=?').get(...ordered(a, b));
  const friendIds = (id) => db.prepare('SELECT CASE WHEN a=? THEN b ELSE a END AS id FROM friends WHERE a=? OR b=?').all(id, id, id).map((x) => x.id);
  const transaction = (action) => {
    db.exec('BEGIN IMMEDIATE');
    try { const result = action(); db.exec('COMMIT'); return result; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  };
  function rate(key, max, period = 60_000) {
    const now = clock();
    let item = limits.get(key);
    if (!item || item.until <= now) {
      if (limits.size >= 20_000 && !limits.has(key)) fail(503, '服务繁忙，请稍后再试');
      item = { count: 0, until: now + period }; limits.set(key, item);
    }
    if (++item.count > max) fail(429, '操作过于频繁，请稍后再试');
  }
  const announcedPresence = new Map();
  function publishPresence(id) {
    const status = presence(id).status;
    const before = announcedPresence.get(id) ?? 'offline';
    if (status === before) return;
    if (status === 'offline') {
      announcedPresence.delete(id);
      // Only a visible session ending is recorded; invisible activity never moves last_seen.
      db.prepare('UPDATE users SET last_seen=? WHERE id=?').run(clock(), id);
    } else announcedPresence.set(id, status);
    publish(friendIds(id));
  }
  /** Highest live activity across devices: running a task beats using DSH, which beats idling. */
  function activity(id) {
    const devices = [...(leases.get(id)?.values() ?? [])].filter((p) => p.at > clock() - ttl);
    const seen = new Set(devices.map((p) => p.activity).filter((value) => ACTIVITIES.includes(value)));
    return seen.has('running') ? 'running' : seen.has('active') ? 'active' : 'idle';
  }
  function presence(id) {
    const active = [...(leases.get(id)?.values() ?? [])].filter((p) => p.at > clock() - ttl);
    // Hidden clients never override an explicitly visible client on another device. Among visible
    // clients the most available one wins, so an idle second device cannot flap you to "away".
    const rank = { online: 3, busy: 2, away: 1 };
    const best = active.filter((p) => p.status !== 'invisible').sort((a, b) => rank[b.status] - rank[a.status] || b.at - a.at)[0];
    return { status: best?.status ?? 'offline' };
  }
  function friendView(row) {
    const { status } = presence(row.id);
    // A status message is rich presence: shown only while visibly online.
    const labelsMap = labelsOf(row);
    const active = status === 'online' ? activity(row.id) : '';
    const word = status === 'offline' ? '' : status === 'online' ? (labelsMap[active] || '') : (labelsMap[status] || '');
    return {
      ...userView(row), status,
      message: status === 'offline' ? '' : row.message,
      statusLabel: word,
      activity: status === 'online' ? active : '',
      avatarAt: row.avatar_at ?? 0,
      lastSeen: status === 'offline' ? row.last_seen ?? null : null,
    };
  }
  const MESSAGE_KEEP = options.messageKeep ?? 1000;
  function lastRead(reader, peer) { return db.prepare('SELECT last_read FROM reads WHERE reader=? AND peer=?').get(reader, peer)?.last_read ?? 0; }
  function messageView(row) { return { id: row.id, from: row.from_id, to: row.to_id, body: row.body, at: row.created_at }; }
  function chatSummary(id, peer) {
    const last = db.prepare('SELECT * FROM messages WHERE (from_id=? AND to_id=?) OR (from_id=? AND to_id=?) ORDER BY id DESC LIMIT 1').get(id, peer, peer, id);
    const unread = db.prepare('SELECT count(*) AS n FROM messages WHERE from_id=? AND to_id=? AND id>?').get(peer, id, lastRead(id, peer)).n;
    return { unread, lastMessage: last ? messageView(last) : null };
  }
  /** Push one event to every live stream of the given users (messages are not part of the snapshot). */
  function emit(ids, event, data) {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const id of new Set(ids)) for (const stream of streams.get(id) ?? []) if (!stream.write(payload)) stream.destroy();
  }
  function snapshot(id) {
    const friends = friendIds(id).map((fid) => ({ ...friendView(db.prepare('SELECT * FROM users WHERE id=?').get(fid)), ...chatSummary(id, fid) }));
    friends.sort((a, b) => (a.status === 'offline') - (b.status === 'offline') || a.name.localeCompare(b.name));
    const incoming = db.prepare('SELECT * FROM requests WHERE to_id=? ORDER BY created_at DESC').all(id).map((r) => ({ id: r.id, from: userView(db.prepare('SELECT * FROM users WHERE id=?').get(r.from_id)), createdAt: r.created_at }));
    const outgoing = db.prepare('SELECT * FROM requests WHERE from_id=? ORDER BY created_at DESC').all(id).map((r) => ({ id: r.id, to: userView(db.prepare('SELECT * FROM users WHERE id=?').get(r.to_id)), createdAt: r.created_at }));
    return { friends, incoming, outgoing };
  }
  function publish(ids) {
    for (const id of new Set(ids)) {
      const targets = streams.get(id);
      if (!targets) continue;
      const payload = `event: snapshot\ndata: ${JSON.stringify(snapshot(id))}\n\n`;
      for (const stream of targets) {
        if (!stream.write(payload)) stream.destroy();
      }
    }
  }
  function json(res, status, value) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(value));
  }
  async function body(req, maxBytes = 4096) {
    if (!(req.headers['content-type'] ?? '').toLowerCase().startsWith('application/json')) fail(415, '请使用 application/json');
    let size = 0; const chunks = [];
    for await (const chunk of req) {
      size += chunk.length;
      if (size > maxBytes) fail(413, '请求内容过大');
      chunks.push(chunk);
    }
    let value;
    try { value = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch { fail(400, 'JSON 格式错误'); }
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail(400, '请求格式错误');
    return value;
  }
  function name(value) {
    if (typeof value !== 'string') fail(400, '请填写昵称');
    const result = value.trim();
    if (!result || [...result].length > 32 || /[\p{Cc}\p{Cf}]/u.test(result)) fail(400, '昵称需为 1–32 个可见字符');
    return result;
  }
  function message(value) {
    if (typeof value !== 'string') fail(400, '签名格式无效');
    const result = value.trim();
    if ([...result].length > 140 || /[\p{Cc}\p{Cf}]/u.test(result)) fail(400, '签名最多 140 个可见字符');
    return result;
  }
  const AVATAR = /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
  const AVATAR_MAX_BYTES = 24_000;
  function avatar(value) {
    if (value === '' || value === null) return '';
    if (typeof value !== 'string' || value.length > AVATAR_MAX_BYTES * 1.5 || !AVATAR.test(value)) fail(400, '头像格式无效');
    if (Buffer.from(value.slice(value.indexOf(',') + 1), 'base64').length > AVATAR_MAX_BYTES) fail(400, '头像文件过大');
    return value;
  }
  const LABEL_KEYS = ['online', 'away', 'busy', 'active', 'idle', 'running'];
  const ACTIVITIES = ['active', 'idle', 'running'];
  function labels(value) {
    if (value === '' || value === null) return '';
    if (typeof value !== 'object' || Array.isArray(value)) fail(400, '词条格式无效');
    const result = {};
    for (const [key, raw] of Object.entries(value)) {
      if (!LABEL_KEYS.includes(key)) fail(400, '词条名称无效');
      if (typeof raw !== 'string') fail(400, '词条格式无效');
      const word = raw.trim();
      if (!word) continue;
      if ([...word].length > 12 || /[\p{Cc}\p{Cf}\n]/u.test(word)) fail(400, '词条最多 12 个可见字符');
      result[key] = word;
    }
    return Object.keys(result).length ? JSON.stringify(result) : '';
  }
  function labelsOf(row) {
    try { const parsed = JSON.parse(row.labels || '{}'); return Object.fromEntries(Object.entries(parsed).filter(([k, v]) => LABEL_KEYS.includes(k) && typeof v === 'string').map(([k, v]) => [k, v.slice(0, 12)])); }
    catch { return {}; }
  }
  // 32 unambiguous characters: no 0/O, 1/I/L to avoid dictation mistakes.
  const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  function transferCode() {
    const bytes = randomBytes(8);
    return [...bytes].map((byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join('');
  }
  function messageBody(value) {
    if (typeof value !== 'string') fail(400, '消息内容无效');
    const result = value.replace(/\r\n?/g, '\n').trim();
    if (!result) fail(400, '消息不能为空');
    if ([...result].length > 2000) fail(400, '消息最多 2000 字');
    if (/[\u0000-\u0008\u000b-\u001f\u007f\p{Cf}]/u.test(result.replace(/[\u200d\ufe0f]/g, ''))) fail(400, '消息包含不支持的字符');
    return result;
  }
  function device(value) {
    if (typeof value !== 'string' || !/^[\w-]{8,80}$/.test(value)) fail(400, '设备标识无效');
    return value;
  }
  const server = createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Content-Security-Policy', `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors ${frames}`);
    try {
      if (closing) fail(503, '服务正在关闭');
      const path = new URL(req.url, 'http://localhost').pathname;
      const method = req.method;
      // Never trust X-Forwarded-For supplied by the caller. Configure PUBLIC_ORIGIN behind TLS.
      if (req.headers.origin) {
        const expected = publicOrigin ?? `http://${req.headers.host}`;
        if (req.headers.origin !== expected) fail(403, '来源不被允许');
      }
      const ip = req.socket.remoteAddress ?? 'unknown';
      if (path === '/healthz' && method === 'GET') return json(res, 200, { ok: true });
      if (!path.startsWith('/api/')) {
        const files = { '/': ['index.html', 'text/html; charset=utf-8'], '/index.html': ['index.html', 'text/html; charset=utf-8'], '/app.js': ['app.js', 'text/javascript; charset=utf-8'], '/style.css': ['style.css', 'text/css; charset=utf-8'] };
        const file = files[path];
        if (!file || !['GET', 'HEAD'].includes(method)) fail(404, '页面不存在');
        const content = await readFile(resolve(WEB, file[0]));
        res.writeHead(200, { 'Content-Type': file[1] });
        return res.end(method === 'HEAD' ? undefined : content);
      }
      rate(`api:${ip}`, options.ipLimitMinute ?? 10_000);
      if (path === '/api/register' && method === 'POST') {
        rate(`register-attempt:${ip}`, (options.registerLimitHour ?? 100) * 10, 60 * 60_000);
        const data = await body(req);
        if (signupCode && (typeof data.signupCode !== 'string' || hash(data.signupCode) !== hash(signupCode))) fail(403, '注册邀请码无效');
        const displayName = name(data.name);
        if (db.prepare('SELECT count(*) AS n FROM users').get().n >= maxUsers) fail(503, '用户容量已满');
        // Invalid input and incorrect signup codes do not consume the successful-registration budget.
        rate(`register:${ip}`, options.registerLimitHour ?? 100, 60 * 60_000);
        const token = randomBytes(32).toString('base64url');
        const user = { id: randomUUID(), name: displayName, code: randomBytes(9).toString('hex').toUpperCase() };
        db.prepare('INSERT INTO users (id, name, code, token_hash, created_at) VALUES (?,?,?,?,?)').run(user.id, user.name, user.code, hash(token), clock());
        return json(res, 201, { token, user });
      }
      if (path === '/api/transfers/claim' && method === 'POST') {
        rate(`transfer-claim:${ip}`, 20);
        const raw = String((await body(req)).code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (!/^[A-Z0-9]{8}$/.test(raw)) fail(400, '迁移码格式不对');
        const row = db.prepare('SELECT * FROM transfers WHERE code_hash=?').get(hash(raw));
        if (!row || row.expires_at <= clock()) fail(404, '迁移码无效或已过期');
        const owner = db.prepare('SELECT * FROM users WHERE id=?').get(row.user_id);
        if (!owner) fail(404, '账号不存在');
        if (row.mode === 'share') {
          // Single use, but the account token keeps working on the machine that minted it.
          db.prepare('DELETE FROM transfers WHERE code_hash=?').run(row.code_hash);
          return json(res, 200, { mode: 'share', blob: row.blob, salt: row.salt, user: userView(owner) });
        }
        const token = randomBytes(32).toString('base64url');
        transaction(() => {
          db.prepare('UPDATE users SET token_hash=? WHERE id=?').run(hash(token), owner.id);
          // One code, one claim: every outstanding code for this account is retired.
          db.prepare('DELETE FROM transfers WHERE user_id=?').run(owner.id);
        });
        return json(res, 200, { mode: 'move', token, user: userView(owner) });
      }
      const authorization = req.headers.authorization ?? '';
      if (!/^Bearer [A-Za-z0-9_-]{43}$/.test(authorization)) fail(401, '请先创建或恢复本浏览器身份');
      const user = db.prepare('SELECT * FROM users WHERE token_hash=?').get(hash(authorization.slice(7)));
      if (!user) fail(401, '身份已失效，请重新创建');
      const id = user.id;
      rate(`identity:${id}`, options.identityLimitMinute ?? 300);
      const counterparts = () => [...friendIds(id), ...db.prepare('SELECT from_id AS id FROM requests WHERE to_id=? UNION SELECT to_id AS id FROM requests WHERE from_id=?').all(id, id).map((r) => r.id)];
      if (path === '/api/transfers' && method === 'POST') {
        rate(`transfer-mint:${id}`, (options.transferLimitHour ?? 20), 60 * 60_000);
        db.prepare('DELETE FROM transfers WHERE expires_at<=?').run(clock());
        // Move mode needs no body at all; share mode carries the encrypted token.
        const input = Number(req.headers['content-length'] ?? 0) > 0 ? await body(req) : {};
        const mode = input.mode === 'share' ? 'share' : 'move';
        const expiresAt = clock() + 10 * 60_000;
        if (mode === 'share') {
          // The Host encrypts the token with a key derived from the code, so this row is useless
          // without the code the user copied by hand.
          const codeHash = typeof input.codeHash === 'string' ? input.codeHash : '';
          if (!/^[a-f0-9]{64}$/.test(codeHash)) fail(400, '共享码无效');
          const blob = typeof input.blob === 'string' ? input.blob : '';
          const salt = typeof input.salt === 'string' ? input.salt : '';
          if (!/^[A-Za-z0-9+/=]{8,4000}$/.test(blob) || !/^[a-f0-9]{32}$/.test(salt)) fail(400, '共享码无效');
          db.prepare('INSERT OR REPLACE INTO transfers (code_hash, user_id, created_at, expires_at, mode, blob, salt) VALUES (?,?,?,?,?,?,?)').run(codeHash, id, clock(), expiresAt, 'share', blob, salt);
          return json(res, 201, { mode, expiresAt });
        }
        const code = transferCode();
        db.prepare('INSERT OR REPLACE INTO transfers (code_hash, user_id, created_at, expires_at, mode) VALUES (?,?,?,?,?)').run(hash(code), id, clock(), expiresAt, 'move');
        return json(res, 201, { mode, code, expiresAt });
      }
      if (path === '/api/me' && method === 'GET') return json(res, 200, { user: { ...userView(user), message: user.message, labels: labelsOf(user), avatarAt: user.avatar_at ?? 0 }, ...presence(id) });
      if (path === '/api/me' && method === 'PATCH') {
        rate(`edit:${id}`, 20);
        // Avatars arrive as a data URL, so this route needs a bigger body than the others.
        const data = await body(req, 48_000);
        if (data.name === undefined && data.message === undefined && data.avatar === undefined && data.labels === undefined) fail(400, '没有需要修改的内容');
        const displayName = data.name === undefined ? user.name : name(data.name);
        const note = data.message === undefined ? user.message : message(data.message);
        const picture = data.avatar === undefined ? user.avatar : avatar(data.avatar);
        const words = data.labels === undefined ? user.labels : labels(data.labels);
        const changedPicture = picture !== user.avatar;
        db.prepare('UPDATE users SET name=?, message=?, avatar=?, avatar_at=?, labels=? WHERE id=?')
          .run(displayName, note, picture, changedPicture ? clock() : (user.avatar_at ?? 0), words, id);
        // A status message is invisible while offline, so editing only the message then must not
        // wake friends' streams: the event alone would reveal when an invisible user is active.
        const nameChanged = displayName !== user.name || changedPicture || words !== user.labels;
        const visibleChange = nameChanged || presence(id).status !== 'offline';
        publish(visibleChange ? [id, ...counterparts()] : [id]);
        return json(res, 200, { user: { ...userView(user), name: displayName, message: note, labels: labelsOf({ labels: words }), avatarAt: changedPicture ? clock() : (user.avatar_at ?? 0) } });
      }
      if (path === '/api/me' && method === 'DELETE') {
        const affected = counterparts();
        leases.delete(id); announcedPresence.delete(id);
        db.prepare('DELETE FROM users WHERE id=?').run(id);
        for (const res of streams.get(id) ?? []) res.end();
        streams.delete(id);
        publish(affected);
        return json(res, 200, { ok: true });
      }
      if (path === '/api/friends' && method === 'GET') return json(res, 200, snapshot(id));
      if (path === '/api/presence' && method === 'POST') {
        rate(`presence:${id}`, 120);
        const data = await body(req); const client = device(data.deviceId);
        if (!STATES.has(data.status)) fail(400, '状态无效');
        let devices = leases.get(id);
        if (!devices) { devices = new Map(); leases.set(id, devices); }
        if (!devices.has(client) && devices.size >= 20) fail(429, '在线客户端过多');
        if (data.activity !== undefined && !ACTIVITIES.includes(data.activity)) fail(400, '活动状态无效');
        devices.set(client, { status: data.status, at: clock(), activity: data.activity });
        publishPresence(id);
        return json(res, 200, { ok: true });
      }
      if (path === '/api/logout' && method === 'POST') {
        const client = device((await body(req)).deviceId);
        leases.get(id)?.delete(client);
        if (!leases.get(id)?.size) leases.delete(id);
        publishPresence(id);
        return json(res, 200, { ok: true });
      }
      if (path === '/api/requests' && method === 'POST') {
        rate(`request:${id}`, 20, 60 * 60_000);
        const code = (await body(req)).code;
        if (typeof code !== 'string' || !/^[0-9a-f]{18}$/i.test(code.trim())) fail(400, '好友码格式无效');
        const target = db.prepare('SELECT * FROM users WHERE code=?').get(code.trim().toUpperCase());
        if (!target) fail(404, '未找到该好友码');
        if (target.id === id) fail(400, '不能添加自己');
        if (related(id, target.id)) fail(409, '已经是好友');
        if (db.prepare('SELECT 1 FROM requests WHERE (from_id=? AND to_id=?) OR (from_id=? AND to_id=?)').get(id, target.id, target.id, id)) fail(409, '已有待处理申请，请查看申请列表');
        if (friendIds(id).length >= 500 || friendIds(target.id).length >= 500) fail(409, '好友数量已达上限');
        if (db.prepare('SELECT count(*) AS n FROM requests WHERE from_id=? OR to_id=?').get(id, id).n >= 100 || db.prepare('SELECT count(*) AS n FROM requests WHERE from_id=? OR to_id=?').get(target.id, target.id).n >= 100) fail(409, '待处理申请过多');
        db.prepare('INSERT INTO requests VALUES (?,?,?,?)').run(randomUUID(), id, target.id, clock());
        publish([id, target.id]);
        return json(res, 201, { ok: true });
      }
      const requestMatch = path.match(/^\/api\/requests\/([\w-]+)$/);
      if (requestMatch && method === 'POST') {
        const action = (await body(req)).action;
        const request = db.prepare('SELECT * FROM requests WHERE id=?').get(requestMatch[1]);
        if (!request || ![request.from_id, request.to_id].includes(id)) fail(404, '申请不存在');
        if (!['accept', 'decline', 'cancel'].includes(action)) fail(400, '操作无效');
        if (action === 'cancel' ? request.from_id !== id : request.to_id !== id) fail(403, '无权操作该申请');
        transaction(() => {
          if (action === 'accept') {
            if (friendIds(id).length >= 500 || friendIds(request.from_id).length >= 500) fail(409, '好友数量已达上限');
            db.prepare('INSERT OR IGNORE INTO friends VALUES (?,?)').run(...ordered(request.from_id, request.to_id));
          }
          db.prepare('DELETE FROM requests WHERE id=?').run(request.id);
        });
        publish([request.from_id, request.to_id]);
        return json(res, 200, { ok: true });
      }
      const friendMatch = path.match(/^\/api\/friends\/([\w-]+)$/);
      if (friendMatch && method === 'DELETE') {
        if (!related(id, friendMatch[1])) fail(404, '好友不存在');
        transaction(() => {
          db.prepare('DELETE FROM friends WHERE a=? AND b=?').run(...ordered(id, friendMatch[1]));
          db.prepare('DELETE FROM messages WHERE (from_id=? AND to_id=?) OR (from_id=? AND to_id=?)').run(id, friendMatch[1], friendMatch[1], id);
          db.prepare('DELETE FROM reads WHERE (reader=? AND peer=?) OR (reader=? AND peer=?)').run(id, friendMatch[1], friendMatch[1], id);
        });
        publish([id, friendMatch[1]]);
        return json(res, 200, { ok: true });
      }
      const chatMatch = path.match(/^\/api\/chats\/([\w-]+)$/);
      const readMatch = path.match(/^\/api\/chats\/([\w-]+)\/read$/);
      if (chatMatch && method === 'GET') {
        const peer = chatMatch[1];
        if (!related(id, peer)) fail(404, '好友不存在');
        const query = new URL(req.url, 'http://localhost').searchParams;
        const before = Number(query.get('before') ?? 0);
        const after = Number(query.get('after') ?? 0);
        const requested = Number(query.get('limit') ?? 50);
        if (!Number.isSafeInteger(requested) || requested < 1) fail(400, '分页参数无效');
        const limit = Math.min(100, requested);
        if (!Number.isSafeInteger(before) || !Number.isSafeInteger(after) || before < 0 || after < 0) fail(400, '分页参数无效');
        const pair = '((from_id=? AND to_id=?) OR (from_id=? AND to_id=?))';
        const rows = after
          ? db.prepare(`SELECT * FROM messages WHERE ${pair} AND id>? ORDER BY id ASC LIMIT ?`).all(id, peer, peer, id, after, limit)
          : db.prepare(`SELECT * FROM messages WHERE ${pair} ${before ? 'AND id<?' : ''} ORDER BY id DESC LIMIT ?`).all(...[id, peer, peer, id, ...(before ? [before] : []), limit]).reverse();
        const edge = after ? rows.at(-1)?.id : rows[0]?.id;
        const more = edge ? !!db.prepare(`SELECT 1 FROM messages WHERE ${pair} AND id${after ? '>' : '<'}? LIMIT 1`).get(id, peer, peer, id, edge) : false;
        // The peer's read mark lets the sender show "已读" without exposing anything else.
        return json(res, 200, { messages: rows.map(messageView), more, peerRead: lastRead(peer, id) });
      }
      if (chatMatch && method === 'POST') {
        const peer = chatMatch[1];
        if (!related(id, peer)) fail(403, '只能给好友发消息');
        const input = await body(req, 16384);
        // Uploading the body yields to other requests; friendship may have been removed meanwhile.
        if (!related(id, peer)) fail(403, '只能给好友发消息');
        const text = messageBody(input.body);
        const clientId = input.clientId ?? null;
        if (clientId !== null && (typeof clientId !== 'string' || !/^[A-Za-z0-9_-]{8,80}$/.test(clientId))) fail(400, '重试标识无效');
        if (clientId) {
          const previous = db.prepare('SELECT * FROM messages WHERE from_id=? AND client_id=?').get(id, clientId);
          if (previous) {
            if (previous.to_id !== peer || previous.body !== text) fail(409, '同一重试标识不能用于不同消息');
            return json(res, 200, { message: messageView(previous) });
          }
        }
        rate(`message:${id}`, options.messageLimitMinute ?? 60);
        let row;
        transaction(() => {
          if (!related(id, peer)) fail(403, '只能给好友发消息');
          const info = db.prepare('INSERT INTO messages (from_id, to_id, body, created_at, client_id) VALUES (?,?,?,?,?)').run(id, peer, text, clock(), clientId);
          row = db.prepare('SELECT * FROM messages WHERE id=?').get(info.lastInsertRowid);
          // Sending does not mark unseen incoming messages read; the visible chat acknowledges them explicitly.
          // Bound storage per conversation: keep the most recent MESSAGE_KEEP messages.
          db.prepare(`DELETE FROM messages WHERE id IN (SELECT id FROM messages WHERE (from_id=? AND to_id=?) OR (from_id=? AND to_id=?) ORDER BY id DESC LIMIT -1 OFFSET ?)`).run(id, peer, peer, id, MESSAGE_KEEP);
        });
        const view = messageView(row);
        emit([id, peer], 'message', view);
        return json(res, 201, { message: view });
      }
      if (readMatch && method === 'POST') {
        const peer = readMatch[1];
        if (!related(id, peer)) fail(404, '好友不存在');
        const upTo = (await body(req)).upTo;
        if (!Number.isSafeInteger(upTo) || upTo < 0) fail(400, '已读位置无效');
        transaction(() => {
          if (!related(id, peer)) fail(404, '好友不存在');
          const latest = db.prepare('SELECT max(id) AS m FROM messages WHERE from_id=? AND to_id=?').get(peer, id).m ?? 0;
          const mark = Math.min(upTo, latest);
          db.prepare('INSERT INTO reads (reader, peer, last_read) VALUES (?,?,?) ON CONFLICT(reader, peer) DO UPDATE SET last_read=MAX(last_read, excluded.last_read)').run(id, peer, mark);
        });
        emit([peer], 'read', { reader: id, upTo: lastRead(id, peer) });
        const unread = chatSummary(id, peer).unread;
        emit([id], 'read', { reader: id, peer, upTo: lastRead(id, peer), unread });
        return json(res, 200, { ok: true, upTo: lastRead(id, peer), unread });
      }
      const avatarMatch = path.match(/^\/api\/users\/([\w-]+)\/avatar$/);
      if (avatarMatch && method === 'GET') {
        const who = avatarMatch[1];
        if (who !== id && !related(id, who)) fail(403, '只能查看好友头像');
        const row = db.prepare('SELECT avatar, avatar_at FROM users WHERE id=?').get(who);
        if (!row) fail(404, '用户不存在');
        if (!row.avatar) return json(res, 200, { avatar: '', at: 0 });
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, max-age=300' });
        return res.end(JSON.stringify({ avatar: row.avatar, at: row.avatar_at ?? 0 }));
      }
      if (path === '/api/events' && method === 'GET') {
        let set = streams.get(id);
        if (!set) { set = new Set(); streams.set(id, set); }
        if (set.size >= 5) fail(429, '实时连接过多');
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'X-Accel-Buffering': 'no', 'Connection': 'keep-alive' });
        set.add(res);
        res.write(`event: snapshot\ndata: ${JSON.stringify(snapshot(id))}\n\n`);
        res.on('close', () => { set.delete(res); if (!set.size) streams.delete(id); });
        return;
      }
      fail(404, '接口不存在');
    } catch (error) {
      if (res.headersSent) return res.destroy();
      if (error.status === 429) res.setHeader('Retry-After', '60');
      // Do not log headers, credentials, SQL values, or private nicknames.
      if (!(error instanceof HttpError)) options.onError?.(error);
      json(res, error.status ?? 500, { error: error instanceof HttpError ? error.message : '服务器内部错误' });
    }
  });
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  server.maxHeadersCount = 40;
  server.on('clientError', (_error, socket) => socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n'));
  function sweep() {
    for (const [id, devices] of leases) {
      let removed = false;
      for (const [key, value] of devices) if (value.at <= clock() - ttl) { devices.delete(key); removed = true; }
      if (!devices.size) leases.delete(id);
      if (removed) publishPresence(id);
    }
    for (const [key, value] of limits) if (value.until <= clock()) limits.delete(key);
    for (const set of streams.values()) for (const res of set) if (!res.write(': keepalive\n\n')) res.destroy();
  }
  const timer = setInterval(sweep, 5000); timer.unref();
  return {
    server, sweep,
    async close() {
      closing = true; clearInterval(timer);
      for (const set of streams.values()) for (const res of set) res.end();
      await new Promise((done) => { server.close(done); server.closeIdleConnections(); });
      db.close();
    },
  };
}
