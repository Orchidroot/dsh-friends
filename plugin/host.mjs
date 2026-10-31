import { createChatHub, sanitizeMessage } from './chat.mjs';
import { statSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { randomBytes as randomBytesCrypto, scryptSync, createCipheriv, createDecipheriv, createHash } from 'node:crypto';
/**
 * Host-side friends agent. Owns the identity token (kept in the DSH credential
 * store), the presence heartbeat and friend-list polling. The browser never sees
 * the token and can only call the fixed operations exported from here.
 */
export const RECORD_ID = 'identity';
export const STATUSES = ['online', 'away', 'busy', 'invisible'];
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const ID = /^[A-Za-z0-9-]{1,80}$/;
const CODE = /^[0-9A-Fa-f]{18}$/;

/** 32 unambiguous characters: no 0/O, 1/I/L to avoid dictation mistakes. */
const SHARE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function shareCode() {
  return [...randomBytesCrypto(8)].map((byte) => SHARE_ALPHABET[byte % SHARE_ALPHABET.length]).join('');
}
const shareKey = (code, salt) => scryptSync(code, Buffer.from(salt, 'hex'), 32, { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
/** Encrypt the identity token so only someone holding the code can read it. */
export function sealToken(token, code, salt = randomBytesCrypto(16).toString('hex')) {
  const iv = randomBytesCrypto(12);
  const cipher = createCipheriv('aes-256-gcm', shareKey(code, salt), iv);
  const sealed = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return { blob: Buffer.concat([iv, cipher.getAuthTag(), sealed]).toString('base64'), salt };
}
export function openToken(blob, code, salt) {
  const raw = Buffer.from(blob, 'base64');
  const iv = raw.subarray(0, 12), tag = raw.subarray(12, 28), body = raw.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', shareKey(code, salt), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
}
export const sha256 = (value) => createHash('sha256').update(value).digest('hex');

export function validateServiceUrl(value = 'http://127.0.0.1:8787') {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('serviceUrl must be an origin without path, credentials, or query');
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))) throw new Error('Use HTTPS for a remote friends service');
  return url.origin;
}

export class FriendsError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

/** Bounded JSON client for the fixed upstream origin; never follows redirects. */
export function createUpstream(origin, fetcher = fetch) {
  return async function call(method, path, { token, data, timeoutMs = 8000 } = {}) {
    const headers = { Accept: 'application/json' };
    if (data !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${token}`;
    let response;
    try {
      response = await fetcher(origin + path, { method, headers, body: data === undefined ? undefined : JSON.stringify(data), redirect: 'error', signal: AbortSignal.timeout(timeoutMs) });
    } catch { throw new FriendsError(0, 'unreachable'); }
    if (!response.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) {
      await response.body?.cancel();
      throw new FriendsError(502, 'bad-upstream');
    }
    const reader = response.body?.getReader(); const parts = []; let size = 0;
    if (reader) {
      try {
        for (;;) {
          const { done, value } = await reader.read(); if (done) break;
          size += value.byteLength;
          if (size > 1_048_576) { await reader.cancel(); throw new FriendsError(502, 'bad-upstream'); }
          parts.push(Buffer.from(value));
        }
      } finally { reader.releaseLock(); }
    }
    let result;
    try { result = JSON.parse(Buffer.concat(parts).toString('utf8')); } catch { throw new FriendsError(502, 'bad-upstream'); }
    if (!response.ok) throw new FriendsError(response.status, typeof result?.error === 'string' ? result.error.slice(0, 200) : 'upstream-error');
    return result;
  };
}

/** Plain, size-bounded projection so upstream data cannot inject fields into the UI. */
const text = (value, max) => typeof value === 'string' ? value.slice(0, max) : '';
const person = (value) => ({ id: text(value?.id, 80), name: text(value?.name, 32), code: text(value?.code, 18) });
const LABEL_KEYS = ['online', 'away', 'busy', 'active', 'idle', 'running'];
function sanitizeLabels(value) {
  const result = {};
  for (const key of LABEL_KEYS) { const word = text(value?.[key], 12); if (word) result[key] = word; }
  return result;
}
function sanitizeSnapshot(data) {
  const list = (value) => Array.isArray(value) ? value.slice(0, 600) : [];
  return {
    friends: list(data?.friends).map((f) => ({
      ...person(f),
      status: STATUSES.includes(f?.status) && f.status !== 'invisible' ? f.status : 'offline',
      message: text(f?.message, 140),
      statusLabel: text(f?.statusLabel, 12),
      activity: ['active', 'idle', 'running'].includes(f?.activity) ? f.activity : '',
      avatarAt: Number.isSafeInteger(f?.avatarAt) ? f.avatarAt : 0,
      lastSeen: Number.isSafeInteger(f?.lastSeen) ? f.lastSeen : null,
      unread: Number.isSafeInteger(f?.unread) && f.unread > 0 ? Math.min(f.unread,99999) : 0,
      lastMessage: sanitizeMessage(f?.lastMessage),
    })),
    incoming: list(data?.incoming).map((r) => ({ id: text(r?.id, 80), from: person(r?.from), createdAt: Number.isSafeInteger(r?.createdAt) ? r.createdAt : null })),
    outgoing: list(data?.outgoing).map((r) => ({ id: text(r?.id, 80), to: person(r?.to), createdAt: Number.isSafeInteger(r?.createdAt) ? r.createdAt : null })),
  };
}

/**
 * @param options.store - { read(): Promise<object|undefined>, write(value|undefined): Promise<void> }
 * @param options.call - upstream client from createUpstream
 * @param options.deviceId - stable per Host process
 */
export function createAgent({ store, call, deviceId, connect, heartbeatMs = 15_000, pollMs = 5_000, awayAfterMs = 10 * 60_000, activeWindowMs = 5 * 60_000, now = Date.now, schedule = setInterval, unschedule = clearInterval }) {
  let identity;           // { token, status, paused }
  let user = null;
  let chat = null;
  let lists = { friends: [], incoming: [], outgoing: [] };
  let link = 'idle';      // idle | connecting | connected | disconnected | paused | unauthorized
  let lastError = '';
  let lastSnapshotAt = 0;
  let lastBeatAt = 0;
  let lastActiveAt = now();
  let sentStatus = '';
  let revision = 0;
  let timer, loading, disposed = false;
  let generation = 0;      // bumps whenever the identity changes; stale async results are dropped
  let lastWatchedAt = 0;   // last time a browser asked for state
  let ticks = 0;
  let ticking = false;
  // Single-flight: at most one heartbeat and one poll in flight. A request made while one is
  // running sets `again`, so the latest intent still goes out once, never a growing backlog.
  let beatFlight = null, beatAgain = false;
  let pollFlight = null, pollAgain = false, pollSeq = 0, appliedSeq = 0;
  // Identity-changing operations (register/pause/forget/...) stay serialized among themselves,
  // but they never wait behind heartbeats or polls.
  let queue = Promise.resolve();
  const listeners = new Set();
  const serial = (work) => { const task = queue.then(work, work); queue = task.catch(() => {}); return task; };
  const changed = () => { revision++; chat?.sync(); for (const fn of listeners) { try { fn(revision); } catch { /* listener faults stay contained */ } } chat?.wake(); };
  const fail = (error) => { lastError = error instanceof FriendsError ? error.message : 'internal'; };
  /** Steam-style auto-away: "online" reports "away" when no visible DSH window was active for a while. */
  const effectiveStatus = () => identity.status === 'online' && awayAfterMs > 0 && now() - lastActiveAt > awayAfterMs ? 'away' : identity.status;

  // --- task activity -------------------------------------------------------
  // DSH appends to the session log while a turn is streaming, so a fresh mtime is a
  // serviceable "a task is running" signal without reading any conversation content.
  const sessionsRoot = join(homedir(), '.dsh', 'sessions');
  const usageFile = join(homedir(), '.dsh', 'dsh-usage', 'usage-ledger.json');
  const RUNNING_WINDOW_MS = 12_000;
  let taskUntil = 0, taskStartedAt = 0, lastTaskScan = 0, usageCache = { at: 0, value: null };
  let scanAt = 0, candidate = '';
  /** Walk the tree only every 30s; between scans a single stat of the cached file is enough. */
  function newestSessionFile() {
    if (candidate && now() - scanAt < 30_000) return candidate;
    scanAt = now();
    let best = { path: '', mtime: 0 };
    try {
      for (const workspace of readdirSync(sessionsRoot, { withFileTypes: true })) {
        if (!workspace.isDirectory()) continue;
        const base = join(sessionsRoot, workspace.name);
        for (const session of readdirSync(base, { withFileTypes: true })) {
          if (!session.isDirectory()) continue;
          for (const file of ['session.v4.jsonl.zstd', 'session.jsonl']) {
            try { const stat = statSync(join(base, session.name, file)); if (stat.mtimeMs > best.mtime) best = { path: join(base, session.name, file), mtime: stat.mtimeMs }; } catch { /* older sessions lack the file */ }
          }
        }
      }
    } catch { return candidate; }
    candidate = best.path;
    return candidate;
  }
  /** Sample the newest session log; a burst of writes marks one "round" of work. */
  function sampleTask() {
    if (now() - lastTaskScan < 3_000) return;
    lastTaskScan = now();
    let mtime = 0;
    const file = newestSessionFile();
    if (file) { try { mtime = statSync(file).mtimeMs; } catch { mtime = 0; } }
    const fresh = mtime > now() - RUNNING_WINDOW_MS;
    if (fresh && now() >= taskUntil) taskStartedAt = now();  // a new burst begins
    taskUntil = fresh ? now() + RUNNING_WINDOW_MS : taskUntil;
  }
  const taskRunning = () => now() < taskUntil;
  const currentActivity = () => taskRunning() ? 'running' : now() - lastActiveAt < activeWindowMs ? 'active' : 'idle';
  /** Today's token usage, read from the same ledger the DSH usage card uses. */
  function usageNow() {
    if (now() - usageCache.at < 10_000) return usageCache.value;
    let value = null;
    try {
      const ledger = JSON.parse(readFileSync(usageFile, 'utf8'));
      const today = ledger?.days?.[new Date(now()).toISOString().slice(0, 10)] || {};
      let tokens = 0, calls = 0, cost = 0;
      for (const models of Object.values(today)) for (const row of Object.values(models)) {
        tokens += (row?.inputTokens || 0) + (row?.outputTokens || 0) + (row?.cacheReadTokens || 0) + (row?.cacheWriteTokens || 0);
        calls += row?.calls || 0;
        cost += row?.cost || 0;
      }
      value = { tokens, calls, cost: Math.round(cost * 100) / 100 };
    } catch { value = usageCache.value; }
    usageCache = { at: now(), value };
    return value;
  }

  const clearIdentity = () => { generation++; identity = undefined; user = null; lists = { friends: [], incoming: [], outgoing: [] }; link = 'idle'; lastError = ''; sentStatus = ''; };

  async function readRecord() {
    const record = await store.read();
    return record && TOKEN.test(record.token)
      ? { token: record.token, status: STATUSES.includes(record.status) ? record.status : 'online', paused: record.paused === true }
      : undefined;
  }
  const ready = () => (loading ??= readRecord().then((value) => { identity ??= value; }).catch(() => {}));
  const persist = (value) => store.write({ token: value.token, status: value.status, paused: value.paused });
  const clear = () => store.write(undefined);

  function unauthorized(error) {
    if (error?.status !== 401) return false;
    // Keep the stored token: a misconfigured or replaced server must not destroy the identity.
    link = 'unauthorized'; lastError = error.message; changed();
    return true;
  }

  const avatars = new Map(); // `id:version` -> data URL (bounded LRU)
  async function loadAvatar(id, version) {
    if (!Number.isSafeInteger(version) || version <= 0) return '';
    const key = `${id}:${version}`;
    const hit = avatars.get(key);
    if (hit) { avatars.delete(key); avatars.set(key, hit); return hit; }
    const result = await call('GET', `/api/users/${encodeURIComponent(id)}/avatar`, { token: requireIdentity().token });
    const raw = typeof result?.avatar === 'string' ? result.avatar : '';
    const data = /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(raw) && raw.length <= 40_000 ? raw : '';
    if (data) {
      avatars.set(key, data);
      while (avatars.size > 200) avatars.delete(avatars.keys().next().value);
    }
    return data;
  }

  async function sendBeat() {
    if (!identity || identity.paused || disposed) return;
    const version = generation;
    const status = effectiveStatus();
    try {
      await call('POST', '/api/presence', { token: identity.token, data: { status, deviceId, activity: status === 'online' ? currentActivity() : undefined } });
      if (version !== generation || disposed || !identity || identity.paused) return;
      lastBeatAt = now(); sentStatus = status;
      if (link !== 'connected') { link = 'connected'; lastError = ''; changed(); }
    } catch (error) {
      if (version !== generation || disposed) return;
      // Back off to the normal cadence after a failure instead of retrying on every tick.
      lastBeatAt = now();
      if (!unauthorized(error)) { link = 'disconnected'; fail(error); changed(); }
    }
  }
  function beat() {
    if (beatFlight) { beatAgain = true; return beatFlight; }
    beatFlight = (async () => {
      try { do { beatAgain = false; await sendBeat(); } while (beatAgain && !disposed); }
      finally { beatFlight = null; }
    })();
    return beatFlight;
  }

  async function fetchSnapshot() {
    if (!identity || disposed) return;
    const version = generation; const token = identity.token; const seq = ++pollSeq; const liveStamp = chat?.stamp;
    try {
      const [me, next] = await Promise.all([
        user ? Promise.resolve(null) : call('GET', '/api/me', { token }),
        call('GET', '/api/friends', { token }),
      ]);
      // Drop results for another identity, and results older than one already applied.
      if (version !== generation || !identity || disposed || seq < appliedSeq) return;
      if (liveStamp !== chat?.stamp) { pollAgain = true; return; }
      appliedSeq = seq;
      if (me) user = {
        ...person(me.user), message: text(me.user?.message, 140),
        avatarAt: Number.isSafeInteger(me.user?.avatarAt) ? me.user.avatarAt : 0,
        labels: sanitizeLabels(me.user?.labels),
      };
      lists = sanitizeSnapshot(next); chat?.observeSnapshot(lists); lastSnapshotAt = now();
      if (identity.paused && link !== 'paused') { link = 'paused'; lastError = ''; }
      else if (!identity.paused && link === 'disconnected' && sentStatus) { link = 'connected'; lastError = ''; }
      changed();
    } catch (error) {
      if (version !== generation || !identity || disposed) return;
      if (!unauthorized(error)) { if (link !== 'paused') link = 'disconnected'; fail(error); changed(); }
    }
  }
  function poll() {
    if (pollFlight) { pollAgain = true; return pollFlight; }
    pollFlight = (async () => {
      try { do { pollAgain = false; await fetchSnapshot(); } while (pollAgain && !disposed); }
      finally { pollFlight = null; }
    })();
    return pollFlight;
  }

  async function tick() {
    if (!identity || disposed || ticking) return;
    ticking = true;
    try {
      sampleTask();
      if (!identity.paused && (now() - lastBeatAt >= heartbeatMs - 1000 || (sentStatus && sentStatus !== effectiveStatus()))) await beat();
      ticks++;
      const watched = now() - lastWatchedAt < 30_000;
      if (watched || ticks % Math.max(1, Math.round(60_000 / pollMs)) === 0) await poll();
    } finally { ticking = false; }
  }
  function start() {
    if (timer || disposed) return;
    timer = schedule(() => { tick().catch(() => {}); }, pollMs);
  }
  async function release(token = identity?.token) {
    if (!token) return;
    sentStatus = '';
    try { await call('POST', '/api/logout', { token, data: { deviceId }, timeoutMs: 3000 }); } catch { /* lease expires on its own */ }
  }

  const requireIdentity = () => { if (!identity) throw new FriendsError(409, 'no-identity'); return identity; };
  const after = async () => { await beat(); await poll(); return view(); };
  function view() {
    return {
      revision, version:'0.8.0', link, error: lastError, hasIdentity: !!identity, user, inboxEpoch:chat?.epoch,
      status: identity?.status ?? 'online', paused: identity?.paused ?? false,
      effectiveStatus: identity && !identity.paused ? effectiveStatus() : 'offline',
      activity: identity && !identity.paused ? currentActivity() : 'idle',
      taskRunning: taskRunning() ? true : false,
      taskStartedAt: taskRunning() ? taskStartedAt : 0,
      usage: usageNow(),
      lastSnapshotAt, ...lists,
    };
  }

  const watch = () => { const stale = now() - lastWatchedAt >= 30000; lastWatchedAt = now(); if(stale && identity) poll().catch(() => {}); };
  chat = createChatHub({
    context: () => ({ token:identity?.token, user, lists, generation, disposed, revision, watch, view }),
    replaceLists: (value) => { lists = sanitizeSnapshot(value); lastSnapshotAt = now(); },
    changed, call, connect, assertIdentity:requireIdentity, error:(status,message) => new FriendsError(status,message), now,
  });
  return {
    history:chat.history, send:chat.send, markRead:chat.markRead, wait:chat.wait,
    async start() {
      await ready();
      if (identity) { link = identity.paused ? 'paused' : 'connecting'; await beat(); await poll(); }
      chat.sync(); start();
      return view();
    },
    view,
    /** Browser asked for state: keep the friend list fresh while someone is looking. */
    watch() { watch(); return view(); },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    /** A visible, focused DSH window reports activity; returning from auto-away re-announces immediately. */
    touch() {
      const wasAway = !!identity && identity.status === 'online' && effectiveStatus() === 'away';
      lastActiveAt = now();
      if (wasAway) { changed(); beat().catch(() => {}); }
    },
    /**
     * Another Host process (CLI, second window) changed the shared credential record:
     * adopt its status/pause choice, or drop the identity if it was forgotten or replaced.
     */
    async reload() {
      if (disposed) return view();
      await serial(async () => {
        const next = await readRecord();
        if (!next) { if (identity) { const token = identity.token; clearIdentity(); changed(); await release(token); } return; }
        if (!identity || next.token !== identity.token) {
          const old = identity?.token;
          clearIdentity(); identity = next; link = next.paused ? 'paused' : 'connecting'; changed();
          if (old) await release(old);
          return;
        }
        if (next.status === identity.status && next.paused === identity.paused) return;
        const pausing = next.paused && !identity.paused;
        identity.status = next.status; identity.paused = next.paused;
        if (pausing) { await release(identity.token); link = 'paused'; lastError = ''; }
        changed();
      });
      if (identity && !identity.paused) await beat();
      await poll();
      return view();
    },
    /**
     * Mint a short-lived code for another computer.
     * 'move' rotates the token there (this machine signs out); 'share' hands over a sealed copy
     * so both machines stay signed in with the same token.
     */
    async transferStart(mode = 'move') {
      const id = requireIdentity();
      if (mode === 'share') {
        const code = shareCode();
        const { blob, salt } = sealToken(id.token, code);
        const result = await call('POST', '/api/transfers', { token: id.token, data: { mode: 'share', codeHash: sha256(code), blob, salt } });
        return { mode: 'share', code, expiresAt: Number.isSafeInteger(result?.expiresAt) ? result.expiresAt : now() + 10 * 60_000 };
      }
      const result = await call('POST', '/api/transfers', { token: id.token });
      if (typeof result?.code !== 'string') throw new FriendsError(502, 'bad-upstream');
      return { mode: 'move', code: result.code, expiresAt: Number.isSafeInteger(result.expiresAt) ? result.expiresAt : now() + 10 * 60_000 };
    },
    /**
     * Adopt an identity from a transfer code. A move code rotates the token (the old machine
     * signs out); a share code carries a sealed copy, so both machines stay signed in.
     */
    async transferClaim(code) {
      await ready();
      const clean = typeof code === 'string' ? code.toUpperCase().replace(/[^A-Z0-9]/g, '') : '';
      if (!/^[A-Z0-9]{8}$/.test(clean)) throw new FriendsError(400, 'invalid-code');
      const version = generation;
      const result = await call('POST', '/api/transfers/claim', { data: { code: clean } });
      let token = typeof result?.token === 'string' ? result.token : '';
      if (result?.mode === 'share') {
        try { token = openToken(String(result.blob ?? ''), clean, String(result.salt ?? '')); }
        catch { throw new FriendsError(400, 'invalid-code'); }
      }
      if (!TOKEN.test(token)) throw new FriendsError(502, 'bad-upstream');
      if (version !== generation) throw new FriendsError(409, 'identity-changed');
      await serial(async () => {
        clearIdentity();
        const next = { token, status: 'online', paused: false };
        await persist(next);
        identity = next; link = 'connecting'; changed();
        chat.sync();
      });
      await beat();
      await poll();
      return view();
    },
    async register(name, signupCode) {
      await ready();
      if (typeof name !== 'string') throw new FriendsError(400, 'invalid');
      await serial(async () => {
        if (identity) throw new FriendsError(409, 'identity-exists');
        const data = { name };
        if (typeof signupCode === 'string' && signupCode) data.signupCode = signupCode.slice(0, 256);
        const result = await call('POST', '/api/register', { data });
        if (!TOKEN.test(result?.token)) throw new FriendsError(502, 'bad-upstream');
        const next = { token: result.token, status: 'online', paused: false };
        // Persist before adopting it so a crash right after registration cannot orphan the account.
        await persist(next);
        generation++; identity = next;
        user = { ...person(result.user), message: '' };
        link = 'connecting'; changed();
      });
      return after();
    },
    /** Avatar data URL for a friend (or yourself) at the version the snapshot advertised. */
    async avatar(userId, version) {
      const id = requireIdentity();
      const who = userId === 'me' ? id && user?.id : userId;
      if (!ID.test(who ?? '')) throw new FriendsError(400, 'invalid');
      return { avatar: await loadAvatar(who, version), at: Number.isSafeInteger(version) ? version : 0 };
    },
    async setStatus(status) {
      if (!STATUSES.includes(status)) throw new FriendsError(400, 'invalid');
      await serial(async () => {
        const id = requireIdentity();
        await persist({ ...id, status, paused: false });
        id.status = status; id.paused = false; changed();
      });
      return after();
    },
    async pause() {
      await serial(async () => {
        const id = requireIdentity();
        await persist({ ...id, paused: true });
        id.paused = true;
        await release(id.token); link = 'paused'; lastError = ''; changed();
      });
      // Refresh in the background: pausing must not wait on a slow or unreachable service.
      poll().catch(() => {}); return view();
    },
    async resume() {
      await serial(async () => {
        const id = requireIdentity();
        await persist({ ...id, paused: false });
        id.paused = false; link = 'connecting'; changed();
      });
      return after();
    },
    async updateProfile(patch) {
      const id = requireIdentity();
      const data = {};
      if (typeof patch?.name === 'string') data.name = patch.name;
      if (typeof patch?.message === 'string') data.message = patch.message;
      if (typeof patch?.avatar === 'string') data.avatar = patch.avatar;
      if (patch?.labels && typeof patch.labels === 'object') data.labels = patch.labels;
      if (!Object.keys(data).length) throw new FriendsError(400, 'invalid');
      const version = generation;
      const result = await call('PATCH', '/api/me', { token: id.token, data });
      if (version !== generation) return view();
      user = { ...person(result.user), message: text(result.user?.message, 140), avatarAt: Number.isSafeInteger(result.user?.avatarAt) ? result.user.avatarAt : 0, labels: sanitizeLabels(result.user?.labels) };
      changed(); return view();
    },
    async addFriend(code) {
      const id = requireIdentity();
      const clean = typeof code === 'string' ? code.trim().replace(/[\s-]/g, '') : '';
      if (!CODE.test(clean)) throw new FriendsError(400, 'invalid-code');
      await call('POST', '/api/requests', { token: id.token, data: { code: clean.toUpperCase() } });
      await poll(); return view();
    },
    async respond(requestId, action) {
      const id = requireIdentity();
      if (!ID.test(requestId ?? '') || !['accept', 'decline', 'cancel'].includes(action)) throw new FriendsError(400, 'invalid');
      await call('POST', `/api/requests/${requestId}`, { token: id.token, data: { action } });
      await poll(); return view();
    },
    async removeFriend(friendId) {
      const id = requireIdentity();
      if (!ID.test(friendId ?? '')) throw new FriendsError(400, 'invalid');
      await call('DELETE', `/api/friends/${friendId}`, { token: id.token });
      await poll(); return view();
    },
    async refresh() { await poll(); return view(); },
    /** Forget locally only: the account stays on the server and cannot be recovered without the token. */
    async forget() {
      await serial(async () => {
        if (!identity) return;
        const token = identity.token;
        // Delete the credential first: if that fails, the identity stays usable and the error reaches the UI.
        await clear();
        clearIdentity(); changed();
        await release(token);
      });
      return view();
    },
    /** Delete the server account (friendships, requests) and then the local credential. */
    async deleteAccount() {
      await serial(async () => {
        const id = requireIdentity();
        try { await call('DELETE', '/api/me', { token: id.token }); }
        catch (error) { if (error.status !== 401) throw error; }
        await clear();
        clearIdentity(); changed();
      });
      return view();
    },
    /** Resolves once the logout was attempted; never waits behind other work. */
    async dispose() {
      if (disposed) return;
      const token = identity?.paused ? undefined : identity?.token;
      disposed = true;
      if (timer) unschedule(timer);
      listeners.clear(); chat.close();
      await release(token);
    },
  };
}

const json = (status, value) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });

/** Exact RPC table: the browser can only name an operation, never an upstream path or token. */
const OPERATIONS = {
  state: (agent) => agent.watch(),
  touch: (agent) => { agent.touch(); return { ok: true }; },
  register: (agent, input) => agent.register(input.name, input.signupCode),
  transferStart: (agent, input) => agent.transferStart(input.mode),
  transferClaim: (agent, input) => agent.transferClaim(input.code),
  setStatus: (agent, input) => agent.setStatus(input.status),
  avatar: (agent, input) => agent.avatar(input.userId, input.version),
  pause: (agent) => agent.pause(),
  resume: (agent) => agent.resume(),
  updateProfile: (agent, input) => agent.updateProfile({ name: input.name, message: input.message, avatar: input.avatar, labels: input.labels }),
  addFriend: (agent, input) => agent.addFriend(input.code),
  respond: (agent, input) => agent.respond(input.requestId, input.action),
  removeFriend: (agent, input) => agent.removeFriend(input.friendId),
  refresh: (agent) => agent.refresh(),
  forget: (agent) => agent.forget(),
  deleteAccount: (agent) => agent.deleteAccount(),
  history: (agent,input) => agent.history(input.friendId,input.before,input.after),
  send: (agent,input) => agent.send(input.friendId,input.body,input.clientId),
  markRead: (agent,input) => agent.markRead(input.friendId,input.upTo),
  wait: (agent,input,request) => agent.wait(input.since,input.revision,20000,request.signal),
};

export function createRpcHandler(agent, serviceUrl) {
  return async function handle(request) {
    if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) return json(415, { error: 'content-type' });
    const raw = await request.text();
    if (Buffer.byteLength(raw) > 16384) return json(413, { error: 'too-large' });
    let input;
    try { input = JSON.parse(raw); } catch { return json(400, { error: 'invalid-json' }); }
    if (!input || typeof input !== 'object' || typeof input.op !== 'string' || !Object.hasOwn(OPERATIONS, input.op)) return json(400, { error: 'unknown-operation' });
    try {
      const result = await OPERATIONS[input.op](agent, input, request);
      return json(200, { ...result, serviceUrl });
    } catch (error) {
      if (error instanceof FriendsError) {
        const status = error.status === 401 || error.status === 403 ? 409 : error.status >= 400 && error.status < 600 ? error.status : 502;
        return json(status, { error: error.message, upstream: error.status });
      }
      return json(500, { error: 'internal' });
    }
  };
}
