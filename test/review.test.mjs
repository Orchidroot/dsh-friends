// Regression tests for the independent review of 0.2.0 (H1, H2, M1-M4, L2, L3, L6).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { createFriendsService } from '../server/service.mjs';
import { createAgent, createUpstream, createRpcHandler } from '../plugin/host.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const memoryStore = (initial) => {
  let value = initial;
  return { async read() { return value && structuredClone(value); }, async write(next) { value = next && structuredClone(next); }, peek: () => value, set: (next) => { value = next; } };
};
const identity = () => ({ token: 't'.repeat(43), status: 'online', paused: false });

async function service(t, options = {}) {
  let now = Date.now();
  const app = createFriendsService({ database: ':memory:', clock: () => now, ...options });
  await new Promise((done) => app.server.listen(0, '127.0.0.1', done));
  t.after(() => app.close());
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  return { app, origin, call: createUpstream(origin), advance(ms) { now += ms; app.sweep(); } };
}
async function pair(call) {
  const me = await call('POST', '/api/register', { data: { name: 'Me' } });
  const fr = await call('POST', '/api/register', { data: { name: 'Friend' } });
  await call('POST', '/api/requests', { token: me.token, data: { code: fr.user.code } });
  const inc = await call('GET', '/api/friends', { token: fr.token });
  await call('POST', `/api/requests/${inc.incoming[0].id}`, { token: fr.token, data: { action: 'accept' } });
  return { me, fr };
}

test('H1: a hanging service never builds a heartbeat backlog, and pause is not starved', async () => {
  let tickFn; let clock = 0; let presence = 0; let inFlight = 0; let maxInFlight = 0;
  const hang = async () => { inFlight++; maxInFlight = Math.max(maxInFlight, inFlight); await sleep(80); inFlight--; throw Object.assign(new Error('unreachable'), { status: 0 }); };
  const call = async (method, path) => {
    if (path === '/api/presence') { presence++; return hang(); }
    if (path === '/api/friends') return hang();
    return { ok: true };
  };
  const agent = createAgent({ store: memoryStore(identity()), call, deviceId: 'host-backlog', now: () => clock, schedule: (fn) => { tickFn = fn; return 1; }, unschedule() {} });
  await agent.start();
  for (let i = 0; i < 60; i++) { clock += 5000; tickFn(); await sleep(50); }
  const started = Date.now();
  await agent.pause();
  const waited = Date.now() - started;
  // Old code: ~61 presence calls queued and pause waited ~2s (scaled: ~200s real).
  assert.ok(presence <= 25, `presence calls: ${presence}`);
  assert.ok(maxInFlight <= 2, `max concurrent upstream calls: ${maxInFlight}`);
  assert.ok(waited < 60, `pause waited ${waited}ms`);
  await agent.dispose();
});

test('H1: after recovery the queued work does not burst into the rate limit', async (t) => {
  const { call: upstream } = await service(t);
  let down = true; let presence = 0; let tickFn; let clock = 0;
  const me = await upstream('POST', '/api/register', { data: { name: 'Me' } });
  const call = async (method, path, options) => {
    if (down) { await sleep(30); throw Object.assign(new Error('unreachable'), { status: 0 }); }
    if (path === '/api/presence') presence++;
    return upstream(method, path, options);
  };
  const agent = createAgent({ store: memoryStore({ token: me.token, status: 'online', paused: false }), call, deviceId: 'host-recovery', now: () => clock, schedule: (fn) => { tickFn = fn; return 1; }, unschedule() {} });
  await agent.start();
  for (let i = 0; i < 40; i++) { clock += 5000; tickFn(); await sleep(10); }
  down = false;
  for (let i = 0; i < 4; i++) { clock += 5000; tickFn(); await sleep(40); }
  assert.ok(presence <= 3, `presence calls after recovery: ${presence}`);
  assert.equal(agent.view().link, 'connected');
  await agent.dispose();
});

test('H2(a): two visible devices report the most available status, without flapping', async (t) => {
  const { call, advance } = await service(t);
  const { me, fr } = await pair(call);
  const seen = [];
  for (let i = 0; i < 4; i++) {
    advance(1000); // distinct timestamps, so 'most recent' and 'most available' disagree
    await call('POST', '/api/presence', { token: me.token, data: { status: 'online', deviceId: 'device-gui-1' } });
    seen.push((await call('GET', '/api/friends', { token: fr.token })).friends[0].status);
    advance(1000);
    await call('POST', '/api/presence', { token: me.token, data: { status: 'away', deviceId: 'device-cli-2' } });
    seen.push((await call('GET', '/api/friends', { token: fr.token })).friends[0].status);
  }
  assert.deepEqual([...new Set(seen)], ['online']);
});

test('H2(b): a second Host process adopts invisible/pause/forget from the shared credential', async (t) => {
  const { call } = await service(t);
  const shared = memoryStore();
  const gui = createAgent({ store: shared, call, deviceId: 'host-gui-process', schedule: () => 0, unschedule() {} });
  await gui.start(); await gui.register('Me');
  const cli = createAgent({ store: shared, call, deviceId: 'host-cli-process', schedule: () => 0, unschedule() {} });
  await cli.start();
  const friend = createAgent({ store: memoryStore(), call, deviceId: 'host-friend', schedule: () => 0, unschedule() {} });
  await friend.start(); await friend.register('Friend');
  await gui.addFriend(friend.view().user.code);
  await friend.respond((await friend.refresh()).incoming[0].id, 'accept');
  const seen = async () => (await friend.refresh()).friends[0].status;
  assert.equal(await seen(), 'online');
  await gui.setStatus('invisible');
  await cli.reload(); // what credentials/record-updated triggers in index.js
  assert.equal(cli.view().status, 'invisible');
  assert.equal(await seen(), 'offline');
  await gui.setStatus('online'); await cli.reload();
  await gui.pause(); await cli.reload();
  assert.equal(cli.view().paused, true);
  assert.equal(await seen(), 'offline');
  await gui.forget(); await cli.reload();
  assert.equal(cli.view().hasIdentity, false);
  for (const a of [gui, cli, friend]) await a.dispose();
});

test('M2: an older friend list that returns late never overwrites a newer one', async () => {
  let release; const gate = new Promise((r) => { release = r; });
  let calls = 0;
  const call = async (method, path) => {
    if (path === '/api/me') return { user: { id: 'u', name: 'U', code: 'A'.repeat(18) } };
    if (path !== '/api/friends') return { ok: true };
    const n = ++calls;
    if (n === 2) { await gate; return { friends: [], incoming: [], outgoing: [] }; }               // old, slow
    return { friends: [{ id: 'new', name: 'New', code: 'B'.repeat(18), status: 'online' }], incoming: [], outgoing: [] };
  };
  const agent = createAgent({ store: memoryStore(identity()), call, deviceId: 'host-order', schedule: () => 0, unschedule() {} });
  await agent.start();
  const slow = agent.refresh();           // in flight with the stale answer
  const fresh = agent.refresh();          // coalesced: re-runs after the slow one
  release(); await slow; await fresh;
  assert.equal(agent.view().friends[0]?.id, 'new');
  await agent.dispose();
});

test('M3/L2: dispose logs out without waiting for queued work; forget deletes before clearing', async () => {
  const calls = [];
  let block;
  const call = async (method, path) => {
    calls.push(path);
    if (path === '/api/friends') return { friends: [], incoming: [], outgoing: [] };
    if (path === '/api/me') return { user: { id: 'u', name: 'U', code: 'A'.repeat(18) } };
    return { ok: true };
  };
  const store = memoryStore(identity());
  const agent = createAgent({ store, call, deviceId: 'host-dispose', schedule: () => 0, unschedule() {} });
  await agent.start();
  // A credential store that hangs must not delay the logout on shutdown.
  store.write = () => new Promise((r) => { block = r; });
  agent.setStatus('busy').catch(() => {});
  await sleep(5);
  const started = Date.now();
  await agent.dispose();
  assert.ok(Date.now() - started < 200);
  assert.ok(calls.includes('/api/logout'));
  block?.();

  // Failed credential deletion leaves the identity intact and surfaces the error.
  const store2 = memoryStore(identity());
  const agent2 = createAgent({ store: store2, call, deviceId: 'host-forget', schedule: () => 0, unschedule() {} });
  await agent2.start();
  store2.write = async () => { throw new Error('credential store closed'); };
  await assert.rejects(agent2.forget(), /credential store closed/);
  assert.equal(agent2.view().hasIdentity, true);
  await agent2.dispose();
});

test('M4: editing only the status message while invisible sends no event to friends', async (t) => {
  const { app, origin, call } = await service(t);
  const { me, fr } = await pair(call);
  let friendSnapshots = 0;
  app.server.prependListener('request', (req, res) => {
    if (req.url !== '/api/events' || req.headers.authorization !== `Bearer ${fr.token}`) return;
    const write = res.write.bind(res);
    res.write = (chunk, ...args) => { if (String(chunk).startsWith('event: snapshot')) friendSnapshots++; return write(chunk, ...args); };
  });
  const abort = new AbortController();
  const stream = await fetch(origin + '/api/events', { headers: { Authorization: `Bearer ${fr.token}` }, signal: abort.signal });
  const reader = stream.body.getReader(); await reader.read();
  await call('POST', '/api/presence', { token: me.token, data: { status: 'invisible', deviceId: 'device-hidden' } });
  await call('PATCH', '/api/me', { token: me.token, data: { message: 'secretly working' } });
  assert.equal(friendSnapshots, 1, 'only the initial snapshot');
  await call('PATCH', '/api/me', { token: me.token, data: { name: 'Renamed' } });
  assert.equal(friendSnapshots, 2, 'a rename is visible and still notifies');
  abort.abort(); await reader.cancel().catch(() => {});
});

test('L3: the RPC op must be a string', async () => {
  const handle = createRpcHandler({ watch: () => ({ ok: 1 }) }, 'http://127.0.0.1:8787');
  const response = await handle(new Request('http://dsh.internal/api/dsh-friends.rpc', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: ['state'] }) }));
  assert.equal(response.status, 400);
});

test('L6: two services opening the same new database migrate without crashing', async (t) => {
  const { mkdtemp, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = await mkdtemp(join(tmpdir(), 'dsf-migrate-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const database = join(dir, 'friends.sqlite');
  const a = createFriendsService({ database });
  const b = createFriendsService({ database });
  await a.close(); await b.close();
});

test('M1/L4: client clears a stale error and distinguishes DSH-unreachable from plugin-inactive', async () => {
  const source = await readFile(new URL('../plugin/client.js', import.meta.url), 'utf8');
  let definition; const dict = {}; let mode = 'down'; let pending = null; let getState;
  vm.runInNewContext(source, {
    window: { __ModuleLoader__: { load(d) { definition = d; } }, addEventListener() {}, removeEventListener() {} },
    document: { baseURI: 'http://dsh.internal/', visibilityState: 'visible', hasFocus: () => true, addEventListener() {}, removeEventListener() {} },
    fetch: async () => {
      if (mode === 'down') throw new TypeError('fetch failed');
      if (mode === 'inactive') return new Response('not found', { status: 404 });
      return Response.json({ revision: 0, hasIdentity: false, friends: [], incoming: [], outgoing: [] });
    },
    URL, AbortController, AbortSignal, Response, Date, Math, JSON,
    // Capture the controller's re-sync timer so the test drives real sync cycles.
    setTimeout: (fn) => { pending = fn; return 1; }, clearTimeout() {},
  });
  const React = { createElement() {}, useSyncExternalStore: (_s, get) => { getState = get; return get(); }, useState: (v) => [v, () => {}], useCallback: (f) => f, useEffect() {}, Fragment: 'f' };
  let Page;
  definition.factory(() => React).apply({
    effect(fn) { fn(); },
    locale: { register(ns, v) { Object.assign(dict, v.zh); return () => {}; }, bind: () => (k) => dict[k] ?? k },
    slots: { inject: (_n, fn) => fn(), register: (options, component) => { if (options.name === 'main') Page = component; } },
  });
  Page(); // binds getState
  const cycle = async () => { const fn = pending; pending = null; fn(); await sleep(5); };
  await sleep(5); // initial sync (mode=down)
  assert.equal(getState().error, dict.error_host);
  mode = 'inactive'; await cycle();
  assert.equal(getState().error, dict.error_inactive);
  mode = 'up';
  await cycle(); // first success: revision 0 (new state)
  await cycle(); // second success with the same revision must still not keep an error
  assert.equal(getState().error, '');
  // Same revision arriving after a failure must clear the banner (the reviewer's repro).
  mode = 'down'; await cycle();
  assert.equal(getState().error, dict.error_host);
  mode = 'up'; await cycle();
  assert.equal(getState().error, '', 'stale banner cleared even though revision did not change');
});
