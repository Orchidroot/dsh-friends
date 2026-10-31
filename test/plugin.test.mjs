import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { createFriendsService } from '../server/service.mjs';

import { createAgent, createUpstream, createRpcHandler, validateServiceUrl } from '../plugin/host.mjs';

const memoryStore = (initial) => {
  let value = initial; let writes = 0;
  return { async read() { return value && structuredClone(value); }, async write(next) { writes++; value = next && structuredClone(next); }, peek: () => value, writes: () => writes };
};

async function setup(t, serviceOptions = {}) {
  let now = Date.now();
  const service = createFriendsService({ database: ':memory:', clock: () => now, ...serviceOptions });
  await new Promise((done) => service.server.listen(0, '127.0.0.1', done));
  const origin = `http://127.0.0.1:${service.server.address().port}`;
  const agents = [];
  const make = (deviceId, store = memoryStore(), extra = {}) => {
    const agent = createAgent({ store, call: createUpstream(origin), deviceId, now: () => now, schedule: () => 0, unschedule: () => {}, ...extra });
    agents.push(agent); return { agent, store };
  };
  t.after(async () => { for (const a of agents) await a.dispose(); await service.close(); });
  return { service, origin, make, advance(ms) { now += ms; service.sweep(); }, clock: () => now };
}

async function befriend(a, b) {
  await a.agent.addFriend(b.agent.view().user.code);
  const request = (await b.agent.refresh()).incoming[0];
  await b.agent.respond(request.id, 'accept');
  await a.agent.refresh();
}

test('two Host agents: register, befriend, see presence and status message', async (t) => {
  const { make } = await setup(t);
  const alice = make('host-alice'), bob = make('host-bob');
  await alice.agent.start(); await bob.agent.start();
  assert.equal(alice.agent.view().hasIdentity, false);
  await alice.agent.register('Alice'); await bob.agent.register('Bob');
  // Friend codes may be pasted with separators, as displayed in the UI.
  await alice.agent.addFriend(bob.agent.view().user.code.replace(/(.{6})/g, '$1-'));
  const pending = (await bob.agent.refresh()).incoming;
  assert.equal(pending.length, 1);
  assert.equal(pending[0].from.name, 'Alice');
  await bob.agent.respond(pending[0].id, 'accept');
  await bob.agent.updateProfile({ message: '在写插件' });
  const view = await alice.agent.refresh();
  assert.equal(view.friends[0].name, 'Bob');
  assert.equal(view.friends[0].status, 'online');
  assert.equal(view.friends[0].message, '在写插件');
  assert.ok(!JSON.stringify(view).includes(alice.store.peek().token), 'views never contain the token');
});

test('identity survives a Host restart through the credential store', async (t) => {
  const { make } = await setup(t);
  const store = memoryStore();
  const first = make('host-restart-1', store);
  await first.agent.start(); await first.agent.register('Persistent');
  const code = first.agent.view().user.code;
  await first.agent.dispose();
  const second = make('host-restart-2', store);
  const view = await second.agent.start();
  assert.equal(view.hasIdentity, true);
  assert.equal(view.user.code, code);
  assert.equal(view.link, 'connected');
});

test('invisible and paused look offline to friends; last-seen recorded only for visible sessions', async (t) => {
  const { make, advance } = await setup(t);
  const a = make('host-alpha'), b = make('host-bravo');
  await a.agent.start(); await b.agent.start();
  await a.agent.register('A'); await b.agent.register('B');
  await befriend(a, b);
  await b.agent.updateProfile({ message: 'secret plans' });
  await b.agent.setStatus('invisible');
  let friend = (await a.agent.refresh()).friends[0];
  assert.equal(friend.status, 'offline');
  assert.equal(friend.message, '', 'status message hidden while offline');
  assert.notEqual(friend.lastSeen, null, 'going invisible ends the visible session');
  const seenAt = friend.lastSeen;
  advance(60_000);
  await b.agent.setStatus('busy');
  assert.equal((await a.agent.refresh()).friends[0].status, 'busy');
  await b.agent.pause();
  friend = (await a.agent.refresh()).friends[0];
  assert.equal(friend.status, 'offline');
  assert.ok(friend.lastSeen > seenAt);
  assert.equal(b.agent.view().link, 'paused');
  await b.agent.resume();
  assert.equal((await a.agent.refresh()).friends[0].status, 'busy');
});

test('auto-away after inactivity, and activity restores online immediately', async (t) => {
  const { make, advance } = await setup(t);
  const a = make('host-alpha'), b = make('host-bravo', memoryStore(), { awayAfterMs: 5 * 60_000 });
  await a.agent.start(); await b.agent.start();
  await a.agent.register('A'); await b.agent.register('B');
  await befriend(a, b);
  advance(6 * 60_000);
  await b.agent.refresh(); // agent tick equivalent
  assert.equal(b.agent.view().effectiveStatus, 'away');
  await b.agent.setStatus('online'); // explicit choice re-announces with current activity state
  assert.equal((await a.agent.refresh()).friends[0].status, 'away');
  b.agent.touch();
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(b.agent.view().effectiveStatus, 'online');
  assert.equal((await a.agent.refresh()).friends[0].status, 'online');
});

test('delete account removes friendships for both sides and clears the credential', async (t) => {
  const { make } = await setup(t);
  const a = make('host-alpha'), b = make('host-bravo');
  await a.agent.start(); await b.agent.start();
  await a.agent.register('A'); await b.agent.register('B');
  await befriend(a, b);
  await b.agent.deleteAccount();
  assert.equal(b.store.peek(), undefined);
  assert.equal(b.agent.view().hasIdentity, false);
  assert.equal((await a.agent.refresh()).friends.length, 0);
});

test('forget keeps the server account but drops the local credential', async (t) => {
  const { make } = await setup(t);
  const a = make('host-alpha'), b = make('host-bravo');
  await a.agent.start(); await b.agent.start();
  await a.agent.register('A'); await b.agent.register('B');
  await befriend(a, b);
  await b.agent.forget();
  assert.equal(b.store.peek(), undefined);
  assert.equal((await a.agent.refresh()).friends.length, 1);
  assert.equal((await a.agent.refresh()).friends[0].status, 'offline');
});

test('server data reset: 401 keeps the stored token and reports unauthorized', async (t) => {
  const { make, origin } = await setup(t);
  const store = memoryStore({ token: 'x'.repeat(43), status: 'online', paused: false });
  const a = make('host-alpha', store);
  const view = await a.agent.start();
  assert.equal(view.link, 'unauthorized');
  assert.equal(store.peek().token, 'x'.repeat(43));
  assert.ok(origin);
});

test('unreachable service: agent reports disconnected and never throws from start', async () => {
  const agent = createAgent({ store: memoryStore({ token: 'y'.repeat(43), status: 'online', paused: false }), call: createUpstream('http://127.0.0.1:9'), deviceId: 'host-unreachable', schedule: () => 0, unschedule: () => {} });
  const view = await agent.start();
  assert.equal(view.link, 'disconnected');
  assert.equal(view.error, 'unreachable');
  await agent.dispose();
});

test('upstream client: no redirects, bounded body, JSON only', async () => {
  let seen;
  const call = createUpstream('https://friends.example.com', async (url, init) => { seen = { url, ...init }; return new Response('<html>', { headers: { 'Content-Type': 'text/html' } }); });
  await assert.rejects(call('GET', '/api/me', { token: 'z'.repeat(43) }), /bad-upstream/);
  assert.equal(seen.url, 'https://friends.example.com/api/me');
  assert.equal(seen.redirect, 'error');
  assert.equal(seen.headers.Authorization, `Bearer ${'z'.repeat(43)}`);
  const huge = createUpstream('https://friends.example.com', async () => Response.json({ a: 'x'.repeat(1_100_000) }));
  await assert.rejects(huge('GET', '/api/me'), /bad-upstream/);
  for (const bad of ['http://example.com', 'https://x.test/api', 'https://u:p@x.test', 'https://x.test/?a=1', 'file:///etc/passwd']) assert.throws(() => validateServiceUrl(bad));
});

test('RPC handler only exposes named operations and maps errors', async (t) => {
  const { make } = await setup(t);
  const { agent } = make('host-rpc-test');
  await agent.start();
  const handle = createRpcHandler(agent, 'http://127.0.0.1:8787');
  const rpc = async (body, type = 'application/json') => {
    const response = await handle(new Request('http://dsh.internal/api/dsh-friends.rpc', { method: 'POST', headers: { 'Content-Type': type }, body: typeof body === 'string' ? body : JSON.stringify(body) }));
    return { status: response.status, body: await response.json() };
  };
  assert.equal((await rpc({ op: 'state' })).body.hasIdentity, false);
  assert.equal((await rpc({ op: 'constructor' })).status, 400);
  assert.equal((await rpc({ op: '__proto__' })).status, 400);
  assert.equal((await rpc({ op: 'call', path: '/api/me' })).status, 400);
  assert.equal((await rpc('{', 'application/json')).status, 400);
  assert.equal((await rpc({ op: 'state' }, 'text/plain')).status, 415);
  assert.equal((await rpc({ op: 'addFriend', code: 'nope' })).status, 409, 'no identity yet');
  const created = await rpc({ op: 'register', name: 'Rpc' });
  assert.equal(created.status, 200);
  assert.equal(created.body.serviceUrl, 'http://127.0.0.1:8787');
  assert.ok(!('token' in created.body));
  assert.equal((await rpc({ op: 'addFriend', code: 'nope' })).body.error, 'invalid-code');
  assert.equal((await rpc({ op: 'respond', requestId: '../me', action: 'accept' })).body.error, 'invalid');
  assert.equal((await rpc({ op: 'setStatus', status: 'godmode' })).status, 400);
  assert.equal((await rpc({ op: 'register', name: 'Twice' })).body.error, 'identity-exists');
});

test('serialized lease operations: pause wins over an in-flight heartbeat', async () => {
  const calls = []; let release;
  const gate = new Promise((r) => { release = r; });
  const call = async (method, path, options) => {
    calls.push(path);
    if (path === '/api/presence' && calls.filter((p) => p === '/api/presence').length === 1) await gate;
    if (path === '/api/friends') return { friends: [], incoming: [], outgoing: [] };
    if (path === '/api/me') return { user: { id: 'u', name: 'U', code: 'A'.repeat(18), message: '' } };
    return { ok: true };
  };
  const agent = createAgent({ store: memoryStore({ token: 't'.repeat(43), status: 'online', paused: false }), call, deviceId: 'host-serial', schedule: () => 0, unschedule: () => {} });
  const starting = agent.start();
  await new Promise((r) => setTimeout(r, 10));
  const pausing = agent.pause();
  release(); await starting; await pausing;
  const leaseOps = calls.filter((p) => p === '/api/presence' || p === '/api/logout');
  assert.deepEqual(leaseOps, ['/api/presence', '/api/logout']);
  assert.equal(agent.view().link, 'paused');
  await agent.dispose();
});

test('browser artifact: registers native slots, never touches storage, cleans up', async () => {
  const source = await readFile(new URL('../plugin/client.js', import.meta.url), 'utf8');
  // "token" also names token *counts* in the usage line, so this checks for credentials instead.
  const code = source.replace(/\/\/.*$/gm, '');
  assert.ok(!/localStorage|sessionStorage|innerHTML/i.test(code), 'no storage or HTML injection in the browser');
  assert.ok(!/Bearer|Authorization/i.test(code), 'the browser never sends credentials itself');
  let definition; const slots = []; const cleanups = []; const listeners = new Map(); let timers = 0; const requests = [];
  const add = (target) => (type, fn) => listeners.set(`${target}:${type}`, (listeners.get(`${target}:${type}`) ?? 0) + 1);
  const remove = (target) => (type) => listeners.set(`${target}:${type}`, listeners.get(`${target}:${type}`) - 1);
  vm.runInNewContext(source, {
    window: { __ModuleLoader__: { load(value) { definition = value; } }, addEventListener: add('w'), removeEventListener: remove('w') },
    document: { baseURI: 'http://dsh.internal/app/', visibilityState: 'visible', hasFocus: () => true, addEventListener: add('d'), removeEventListener: remove('d') },
    fetch: async (url, init) => { requests.push({ url: String(url), body: JSON.parse(init.body) }); return Response.json({ revision: 1, hasIdentity: false, friends: [], incoming: [], outgoing: [] }); },
    URL, AbortController, AbortSignal, Response, Date, Math, JSON,
    setTimeout: (fn, ms) => { timers++; return { fn, ms }; }, clearTimeout: (x) => { if (x) timers--; },
  });
  assert.equal(definition.id, 'dsh-friends-plugin');
  const plugin = definition.factory((name) => { assert.equal(name, 'react'); return { createElement() {}, useSyncExternalStore() {}, useState() {}, useCallback() {}, useEffect() {}, Fragment: 'f' }; });
  plugin.apply({
    effect(fn) { const c = fn(); if (typeof c === 'function') cleanups.push(c); },
    locale: { register: () => () => {}, bind: () => (k) => k },
    slots: { inject: (_n, fn) => fn(), register: (options) => slots.push(options) },
  });
  await new Promise((r) => setTimeout(r, 10));
  assert.ok(slots.some((s) => s.name === 'main' && s.key === 'dsh-friends'));
  // One click on the sidebar 好友 row opens the float; it must not switch the DSH panel.
  assert.ok(slots.some((s) => s.name === 'sidebar.footer.action' && s.id === 'dsh-friends'));
  assert.equal(slots.some((s) => s.name === 'sidebar.panellist'), false, 'no panel row that would navigate away');
  assert.ok(slots.some((s) => s.name === 'shell.overlay'));
  assert.ok(requests.every((r) => r.url === 'http://dsh.internal/app/api/dsh-friends.rpc'), 'document-relative RPC path');
  assert.ok(requests.some((r) => r.body.op === 'state'));
  for (const c of cleanups.reverse()) c();
  assert.ok([...listeners.values()].every((n) => n === 0), 'all listeners removed');
});

test('concurrent register calls create exactly one account', async (t) => {
  const { make } = await setup(t);
  const { agent, store } = make('host-concurrent');
  await agent.start();
  const results = await Promise.allSettled([agent.register('One'), agent.register('Two')]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(results.find((r) => r.status === 'rejected').reason.message, 'identity-exists');
  assert.ok(store.peek().token);
});

test('a friend list that arrives after forget is discarded', async () => {
  let release; const gate = new Promise((r) => { release = r; });
  let holdFriends = false;
  const call = async (method, path) => {
    if (path === '/api/friends') { if (holdFriends) await gate; return { friends: [{ id: 'f', name: 'Ghost', code: 'B'.repeat(18), status: 'online' }], incoming: [], outgoing: [] }; }
    if (path === '/api/me') return { user: { id: 'u', name: 'U', code: 'A'.repeat(18) } };
    return { ok: true };
  };
  const agent = createAgent({ store: memoryStore({ token: 't'.repeat(43), status: 'online', paused: false }), call, deviceId: 'host-stale', schedule: () => 0, unschedule: () => {} });
  await agent.start();
  holdFriends = true;
  const pending = agent.refresh();
  await agent.forget();
  release(); await pending;
  assert.equal(agent.view().hasIdentity, false);
  assert.deepEqual(agent.view().friends, []);
  await agent.dispose();
});

test('RPC never answers 401/403, which the DSH shell reserves for its own session', async () => {
  const fake = { view: () => ({}), watch: () => ({}), refresh: async () => { const { FriendsError } = await import('../plugin/host.mjs'); throw new FriendsError(401, 'unauthorized'); } };
  const handle = createRpcHandler(fake, 'http://127.0.0.1:8787');
  const response = await handle(new Request('http://dsh.internal/api/dsh-friends.rpc', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'refresh' }) }));
  assert.equal(response.status, 409);
  assert.equal((await response.json()).upstream, 401);
});

test('Host polls the friend list often only while a browser is watching', async () => {
  let tickFn; let friendsCalls = 0; let clock = 0;
  const call = async (method, path) => {
    if (path === '/api/friends') { friendsCalls++; return { friends: [], incoming: [], outgoing: [] }; }
    if (path === '/api/me') return { user: { id: 'u', name: 'U', code: 'A'.repeat(18) } };
    return { ok: true };
  };
  const agent = createAgent({ store: memoryStore({ token: 't'.repeat(43), status: 'online', paused: false }), call, deviceId: 'host-adaptive', now: () => clock, schedule: (fn) => { tickFn = fn; return 1; }, unschedule: () => {} });
  await agent.start();
  const run = async (n) => { for (let i = 0; i < n; i++) { clock += 5000; tickFn(); await new Promise((r) => setTimeout(r, 5)); } };
  clock += 60_000; friendsCalls = 0;
  await run(12); // one minute unwatched
  assert.ok(friendsCalls <= 2, `unwatched polls: ${friendsCalls}`);
  agent.watch(); await new Promise((r) => setTimeout(r, 5)); friendsCalls = 0;
  await run(4); // watched
  assert.ok(friendsCalls >= 4, `watched polls: ${friendsCalls}`);
  await agent.dispose();
});
