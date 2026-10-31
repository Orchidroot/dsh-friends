import test from 'node:test';
import assert from 'node:assert/strict';
import { createFriendsService } from '../server/service.mjs';
async function service(t, options = {}) {
  let now = Date.now();
  const app = createFriendsService({ database: ':memory:', clock: () => now, ...options });
  await new Promise((done) => app.server.listen(0, '127.0.0.1', done));
  t.after(() => app.close());
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const api = async (path, data, token, method = data ? 'POST' : 'GET') => {
    const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: data ? JSON.stringify(data) : undefined });
    return { status: response.status, body: await response.json() };
  };
  return { app, base, api, advance() { now += 46_000; app.sweep(); } };
}

test('invisible lease creation/logout/expiry never emits revealing SSE snapshots', async (t) => {
  const { app, base, api, advance } = await service(t);
  let snapshots = 0;
  app.server.prependListener('request', (req, res) => {
    if (req.url !== '/api/events') return;
    const write = res.write.bind(res);
    res.write = (chunk, ...args) => { if (String(chunk).startsWith('event: snapshot')) snapshots++; return write(chunk, ...args); };
  });
  const a = (await api('/api/register', { name: 'Alice' })).body;
  const b = (await api('/api/register', { name: 'Bob' })).body;
  await api('/api/requests', { code: b.user.code }, a.token);
  const pending = (await api('/api/friends', null, b.token)).body.incoming[0];
  await api(`/api/requests/${pending.id}`, { action: 'accept' }, b.token);
  const abort = new AbortController();
  const response = await fetch(base + '/api/events', { headers: { Authorization: `Bearer ${a.token}` }, signal: abort.signal });
  const reader = response.body.getReader(); await reader.read();
  assert.equal(snapshots, 1);
  await api('/api/presence', { deviceId: 'hidden-device', status: 'invisible' }, b.token);
  await api('/api/logout', { deviceId: 'hidden-device' }, b.token);
  assert.equal(snapshots, 1);
  await api('/api/presence', { deviceId: 'hidden-device', status: 'invisible' }, b.token);
  advance(); assert.equal(snapshots, 1);
  await api('/api/presence', { deviceId: 'visible-device', status: 'online' }, b.token);
  assert.equal(snapshots, 2);
  advance(); assert.equal(snapshots, 3);
  abort.abort(); await reader.cancel().catch(() => {});
});

test('identity rate limits do not consume a different user budget behind one proxy', async (t) => {
  const { api } = await service(t, { identityLimitMinute: 3 });
  const a = (await api('/api/register', { name: 'Alice' })).body;
  const b = (await api('/api/register', { name: 'Bob' })).body;
  for (let i = 0; i < 3; i++) assert.equal((await api('/api/me', null, a.token)).status, 200);
  assert.equal((await api('/api/me', null, a.token)).status, 429);
  assert.equal((await api('/api/me', null, b.token)).status, 200);
});

test('failed signup codes do not exhaust the successful signup quota', async (t) => {
  const { api } = await service(t, { registerLimitHour: 2, signupCode: 'example-test' });
  for (let i = 0; i < 5; i++) assert.equal((await api('/api/register', { name: 'invalid' })).status, 403);
  for (let i = 0; i < 2; i++) assert.equal((await api('/api/register', { name: 'valid', signupCode: 'example-test' })).status, 201);
  assert.equal((await api('/api/register', { name: 'over quota', signupCode: 'example-test' })).status, 429);
});

test('the service exposes an API only — no bundled website to keep in sync', async (t) => {
  const { base } = await service(t);
  for (const path of ['/', '/index.html', '/app.js', '/style.css']) {
    const response = await fetch(base + path);
    assert.equal(response.status, 404, path + ' must not serve a page');
    assert.ok(response.headers.get('Content-Type').startsWith('application/json'));
    assert.deepEqual(Object.keys(await response.json()), ['error']);
  }
  assert.equal((await fetch(base + '/server/service.mjs')).status, 404);
  assert.equal((await fetch(base + '/healthz')).status, 200);
});

