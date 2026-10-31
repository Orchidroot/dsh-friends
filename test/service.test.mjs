import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFriendsService } from '../server/service.mjs';

async function setup(t, options = {}) {
  let now = Date.now();
  const app = createFriendsService({ database: ':memory:', clock: () => now, ...options });
  await new Promise((done) => app.server.listen(0, '127.0.0.1', done));
  t.after(() => app.close());
  const base = `http://127.0.0.1:${app.server.address().port}`;
  async function api(path, method = 'GET', data, token, extra = {}) {
    const res = await fetch(base + path, {
      method, headers: { ...(data === undefined ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extra },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
    return { status: res.status, body: await res.json(), headers: res.headers };
  }
  async function register(name) {
    const response = await api('/api/register', 'POST', { name });
    assert.equal(response.status, 201);
    return response.body;
  }
  async function connect(a, b) {
    assert.equal((await api('/api/requests', 'POST', { code: b.user.code }, a.token)).status, 201);
    const incoming = (await api('/api/friends', 'GET', undefined, b.token)).body.incoming;
    assert.equal(incoming.length, 1);
    assert.equal((await api(`/api/requests/${incoming[0].id}`, 'POST', { action: 'accept' }, b.token)).status, 200);
  }
  return { app, api, register, connect, base, advance(ms) { now += ms; app.sweep(); } };
}

test('registration creates private identities; protected endpoints and origin checks', async (t) => {
  const { api, register, base } = await setup(t);
  const a = await register('朋友 Alice');
  assert.equal(a.token.length, 43);
  assert.equal(a.user.code.length, 18);
  assert.equal((await api('/api/me')).status, 401);
  assert.equal((await api('/api/me', 'GET', undefined, 'x'.repeat(43))).status, 401);
  const me = await api('/api/me', 'GET', undefined, a.token);
  assert.equal(me.body.user.name, '朋友 Alice');
  assert.equal(me.body.status, 'offline');
  assert.ok(!JSON.stringify(me.body).includes('token'));
  assert.equal((await api('/api/register', 'POST', { name: 'evil' }, undefined, { Origin: 'https://evil.example' })).status, 403);
  assert.equal((await api('/api/me', 'GET', undefined, a.token, { Origin: base })).status, 200);
  assert.equal((await api('/api/me', 'PATCH', { name: '  新昵称  ' }, a.token)).body.user.name, '新昵称');
});

test('friendship requires consent, is symmetric and strangers cannot see presence', async (t) => {
  const { api, register } = await setup(t);
  const a = await register('Alice'), b = await register('Bob'), c = await register('Charlie');
  assert.equal((await api('/api/requests', 'POST', { code: a.user.code }, a.token)).status, 400);
  assert.equal((await api('/api/requests', 'POST', { code: b.user.code }, a.token)).status, 201);
  const req = (await api('/api/friends', 'GET', undefined, b.token)).body.incoming[0];
  assert.equal((await api('/api/friends', 'GET', undefined, a.token)).body.friends.length, 0);
  assert.equal((await api(`/api/requests/${req.id}`, 'POST', { action: 'accept' }, a.token)).status, 403);
  assert.equal((await api(`/api/requests/${req.id}`, 'POST', { action: 'accept' }, c.token)).status, 404);
  assert.equal((await api('/api/requests', 'POST', { code: a.user.code }, b.token)).status, 409);
  assert.equal((await api(`/api/requests/${req.id}`, 'POST', { action: 'accept' }, b.token)).status, 200);
  assert.equal((await api('/api/friends', 'GET', undefined, a.token)).body.friends[0].id, b.user.id);
  assert.equal((await api('/api/friends', 'GET', undefined, b.token)).body.friends[0].id, a.user.id);
  assert.equal((await api('/api/friends', 'GET', undefined, c.token)).body.friends.length, 0);
  assert.equal((await api(`/api/friends/${b.user.id}`, 'DELETE', undefined, c.token)).status, 404);
  assert.equal((await api(`/api/friends/${b.user.id}`, 'DELETE', undefined, a.token)).status, 200);
  assert.equal((await api('/api/friends', 'GET', undefined, b.token)).body.friends.length, 0);
});

test('presence leases, invisible, multi-device aggregation and expiry', async (t) => {
  const { api, register, connect, advance } = await setup(t);
  const a = await register('Alice'), b = await register('Bob'); await connect(a, b);
  const status = async () => (await api('/api/friends', 'GET', undefined, a.token)).body.friends[0].status;
  const beat = (state, deviceId = 'device-one') => api('/api/presence', 'POST', { status: state, deviceId }, b.token);
  assert.equal(await status(), 'offline');
  await beat('online'); assert.equal(await status(), 'online');
  await beat('busy'); assert.equal(await status(), 'busy');
  await beat('invisible'); assert.equal(await status(), 'offline');
  await beat('away', 'device-two'); assert.equal(await status(), 'away');
  await api('/api/logout', 'POST', { deviceId: 'device-two' }, b.token);
  assert.equal(await status(), 'offline');
  await beat('online'); advance(45_001); assert.equal(await status(), 'offline');
  assert.equal((await beat('bad')).status, 400);
  assert.equal((await api('/api/presence', 'POST', { status: 'online', deviceId: '__' }, b.token)).status, 400);
});

test('decline/cancel enforce correct actors and remove pending requests', async (t) => {
  const { api, register } = await setup(t);
  const a = await register('Alice'), b = await register('Bob');
  await api('/api/requests', 'POST', { code: b.user.code }, a.token);
  const req = (await api('/api/friends', 'GET', undefined, b.token)).body.incoming[0];
  assert.equal((await api(`/api/requests/${req.id}`, 'POST', { action: 'cancel' }, b.token)).status, 403);
  assert.equal((await api(`/api/requests/${req.id}`, 'POST', { action: 'cancel' }, a.token)).status, 200);
  await api('/api/requests', 'POST', { code: b.user.code }, a.token);
  const req2 = (await api('/api/friends', 'GET', undefined, b.token)).body.incoming[0];
  assert.equal((await api(`/api/requests/${req2.id}`, 'POST', { action: 'decline' }, b.token)).status, 200);
  assert.deepEqual((await api('/api/friends', 'GET', undefined, a.token)).body.outgoing, []);
});

test('validation, quotas, CSP and no credential leakage', async (t) => {
  const { api, register, base } = await setup(t, { registerLimitHour: 6 });
  assert.equal((await api('/api/register', 'POST', { name: '\u0000bad' })).status, 400);
  assert.equal((await api('/api/register', 'POST', { name: 'x'.repeat(33) })).status, 400);
  assert.equal((await api('/api/register', 'POST', { name: '' })).status, 400);
  const a = await register('<img src=x onerror=alert(1)>');
  assert.equal((await api('/api/me', 'GET', undefined, a.token)).body.user.name, a.user.name);
  const plain = await fetch(base + '/api/register', { method: 'POST', body: '{}' });
  assert.equal(plain.status, 415);
  // The profile route accepts avatars, so oversized bodies are rejected by validation now.
  const big = await api('/api/me', 'PATCH', { name: 'x'.repeat(5000) }, a.token);
  assert.equal(big.status, 400);
  const tooBig = await api('/api/me', 'PATCH', { name: 'x'.repeat(60_000) }, a.token).catch((e) => ({ status: e.cause?.code === 'ECONNRESET' ? 413 : 0 }));
  assert.equal(tooBig.status, 413);
  const response = await fetch(base + '/healthz');
  assert.match(response.headers.get('Content-Security-Policy'), /frame-ancestors/);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
  assert.equal((await api('/api/register', 'POST', { name: 'Five' })).status, 201);
  for (let i = 0; i < 4; i++) await api('/api/register', 'POST', { name: 'quota' });
  assert.equal((await api('/api/register', 'POST', { name: 'over quota' })).status, 429);
});

test('SQLite persists identity and friendship but never online leases', async (t) => {
  const temp = await mkdtemp(join(tmpdir(), 'dsh-friends-'));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const database = join(temp, 'friends.sqlite');
  let app = createFriendsService({ database });
  await new Promise((done) => app.server.listen(0, '127.0.0.1', done));
  async function request(path, method = 'GET', data, token) {
    const response = await fetch(`http://127.0.0.1:${app.server.address().port}${path}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: data === undefined ? undefined : JSON.stringify(data) });
    assert.ok(response.ok); return response.json();
  }
  const identity = await request('/api/register', 'POST', { name: 'persist' });
  const friend = await request('/api/register', 'POST', { name: 'friend' });
  const pending = await request('/api/register', 'POST', { name: 'pending' });
  await request('/api/requests', 'POST', { code: friend.user.code }, identity.token);
  const incoming = (await request('/api/friends', 'GET', undefined, friend.token)).incoming[0];
  await request(`/api/requests/${incoming.id}`, 'POST', { action: 'accept' }, friend.token);
  await request('/api/requests', 'POST', { code: pending.user.code }, identity.token);
  await request('/api/presence', 'POST', { status: 'online', deviceId: 'persist-device' }, identity.token);
  await app.close();
  app = createFriendsService({ database });
  await new Promise((done) => app.server.listen(0, '127.0.0.1', done));
  try {
    const me = await request('/api/me', 'GET', undefined, identity.token);
    assert.equal(me.status, 'offline');
    const friends = await request('/api/friends', 'GET', undefined, identity.token);
    assert.equal(friends.friends[0].id, friend.user.id);
    assert.equal(friends.outgoing[0].to.id, pending.user.id);
    assert.equal((await request('/api/friends', 'GET', undefined, friend.token)).friends[0].id, identity.user.id);
    assert.equal((await request('/api/friends', 'GET', undefined, pending.token)).incoming.length, 1);
  } finally { await app.close(); }
});

test('authenticated SSE only sends own friend snapshot and does not leak token in URL', async (t) => {
  const { base, register, connect, api } = await setup(t);
  const a = await register('Alice'), b = await register('Bob'); await connect(a, b);
  const controller = new AbortController();
  const response = await fetch(base + '/api/events', { headers: { Authorization: `Bearer ${a.token}` }, signal: controller.signal });
  assert.equal(response.status, 200);
  const reader = response.body.getReader();
  const initial = new TextDecoder().decode((await reader.read()).value);
  assert.match(initial, /event: snapshot/);
  assert.ok(!initial.includes(a.token));
  await api('/api/presence', 'POST', { status: 'online', deviceId: 'other-device' }, b.token);
  const updated = new TextDecoder().decode((await reader.read()).value);
  assert.match(updated, /"status":"online"/);
  controller.abort();
  await reader.cancel().catch(() => {});
});

test('optional signup code and public TLS origin', async (t) => {
  const { api } = await setup(t, { signupCode: 'local-test-only', publicOrigin: 'https://friends.example.com' });
  assert.equal((await api('/api/register', 'POST', { name: 'Alice' })).status, 403);
  assert.equal((await api('/api/register', 'POST', { name: 'Alice', signupCode: 'local-test-only' }, undefined, { Origin: 'https://friends.example.com' })).status, 201);
});
