// Identity transfer: mint a code on one machine, claim it on another, old token dies.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFriendsService } from '../server/service.mjs';
import { createUpstream, createAgent, sealToken, openToken, sha256 } from '../plugin/host.mjs';

async function setup(t) {
  let now = 1_800_000_000_000;
  const app = createFriendsService({ database: ':memory:', clock: () => now });
  await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  const call = createUpstream(origin);
  t.after(() => app.close());
  return { call, advance(ms) { now += ms; } };
}

test('claiming a transfer code hands over the account and kills the old token', async (t) => {
  const { call } = await setup(t);
  const alice = await call('POST', '/api/register', { data: { name: 'Alice' } });
  const bob = await call('POST', '/api/register', { data: { name: 'Bob' } });
  await call('POST', '/api/requests', { token: alice.token, data: { code: bob.user.code } });
  const incoming = await call('GET', '/api/friends', { token: bob.token });
  await call('POST', `/api/requests/${incoming.incoming[0].id}`, { token: bob.token, data: { action: 'accept' } });
  await call('POST', `/api/chats/${bob.user.id}`, { token: alice.token, data: { body: '搬电脑前的消息', clientId: 'before-transfer-1' } });

  const minted = await call('POST', '/api/transfers', { token: alice.token });
  assert.match(minted.code, /^[A-HJ-NP-Z2-9]{8}$/, 'unambiguous 8-character code');
  assert.ok(minted.expiresAt > 0);

  const claimed = await call('POST', '/api/transfers/claim', { data: { code: minted.code.toLowerCase().replace(/(.{4})/, '$1 ') } });
  assert.match(claimed.token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(claimed.user.id, alice.user.id);

  // The new token carries the whole account: friends, messages, history.
  const me = await call('GET', '/api/me', { token: claimed.token });
  assert.equal(me.user.code, alice.user.code);
  assert.equal((await call('GET', '/api/friends', { token: claimed.token })).friends.length, 1);
  const history = await call('GET', `/api/chats/${bob.user.id}`, { token: claimed.token });
  assert.equal(history.messages[0].body, '搬电脑前的消息');

  // The old machine is signed out immediately.
  await assert.rejects(call('GET', '/api/me', { token: alice.token }), (e) => e.status === 401);
  // And the code cannot be used twice.
  await assert.rejects(call('POST', '/api/transfers/claim', { data: { code: minted.code } }), (e) => e.status === 404);
});

test('transfer codes expire, must be 8 characters, and require an identity to mint', async (t) => {
  const { call, advance } = await setup(t);
  const alice = await call('POST', '/api/register', { data: { name: 'Alice' } });
  await assert.rejects(call('POST', '/api/transfers'), (e) => e.status === 401);
  const { code } = await call('POST', '/api/transfers', { token: alice.token });
  await assert.rejects(call('POST', '/api/transfers/claim', { data: { code: 'ABC' } }), (e) => e.status === 400);
  await assert.rejects(call('POST', '/api/transfers/claim', { data: { code: 'ZZZZZZZZ' } }), (e) => e.status === 404);
  advance(11 * 60_000);
  await assert.rejects(call('POST', '/api/transfers/claim', { data: { code } }), (e) => e.status === 404);
});

test('a second mint retires the first code, so only one machine can take over', async (t) => {
  const { call } = await setup(t);
  const alice = await call('POST', '/api/register', { data: { name: 'Alice' } });
  const first = await call('POST', '/api/transfers', { token: alice.token });
  const second = await call('POST', '/api/transfers', { token: alice.token });
  assert.notEqual(first.code, second.code);
  const claimed = await call('POST', '/api/transfers/claim', { data: { code: second.code } });
  assert.match(claimed.token, /^[A-Za-z0-9_-]{43}$/);
  await assert.rejects(call('POST', '/api/transfers/claim', { data: { code: first.code } }), (e) => e.status === 404);
});

test('Host mints and claims transfer codes through the credential store', async (t) => {
  let mints = 0, claims = 0;
  let stored = { token: 'a'.repeat(43), status: 'online', paused: false };
  const call = async (method, path, options) => {
    if (path === '/api/transfers') { mints++; return { code: 'ABCD2345', expiresAt: Date.now() + 600_000 }; }
    if (path === '/api/transfers/claim') { claims++; assert.equal(options.data.code, 'ABCD2345'); return { token: 'b'.repeat(43), user: { id: 'u1', name: 'Alice', code: 'A'.repeat(18) } }; }
    if (path === '/api/me') return { user: { id: 'u1', name: 'Alice', code: 'A'.repeat(18) } };
    if (path === '/api/friends') return { friends: [], incoming: [], outgoing: [] };
    return { ok: true };
  };
  const store = { read: async () => stored, write: async (value) => { stored = value; } };
  const agent = createAgent({ store, call, deviceId: 'host-transfer', schedule: () => 0, unschedule() {} });
  t.after(() => agent.dispose());
  await agent.start();

  const minted = await agent.transferStart();
  assert.deepEqual(minted.code, 'ABCD2345');
  await assert.rejects(agent.transferClaim('nope'), (e) => e.status === 400);
  assert.equal(claims, 0, 'a malformed code never hits the service');

  const view = await agent.transferClaim('abcd-2345');
  assert.equal(view.hasIdentity, true);
  assert.equal(stored.token, 'b'.repeat(43), 'the new token is persisted before use');
  assert.equal(mints, 1);
  assert.equal(claims, 1);
});

test('share codes hand over the same token, so both machines stay signed in', async (t) => {
  const { call } = await setup(t);
  const alice = await call('POST', '/api/register', { data: { name: 'Alice' } });
  const code = 'ABCD2345';
  const sealed = sealToken(alice.token, code);
  const minted = await call('POST', '/api/transfers', { token: alice.token, data: { mode: 'share', codeHash: sha256(code), blob: sealed.blob, salt: sealed.salt } });
  assert.equal(minted.mode, 'share');
  assert.equal('code' in minted, false, 'the server never learns the code in clear');

  const claimed = await call('POST', '/api/transfers/claim', { data: { code } });
  assert.equal(claimed.mode, 'share');
  const recovered = openToken(claimed.blob, code, claimed.salt);
  assert.equal(recovered, alice.token, 'the same token comes back');
  // Both machines work: the original token was never rotated.
  assert.equal((await call('GET', '/api/me', { token: alice.token })).user.id, alice.user.id);
  assert.equal((await call('GET', '/api/me', { token: recovered })).user.id, alice.user.id);
  // The code is single use.
  await assert.rejects(call('POST', '/api/transfers/claim', { data: { code } }), (e) => e.status === 404);
});

test('a sealed token needs the right code', () => {
  const token = 't'.repeat(43);
  const sealed = sealToken(token, 'ABCD2345');
  assert.equal(openToken(sealed.blob, 'ABCD2345', sealed.salt), token);
  assert.throws(() => openToken(sealed.blob, 'ZZZZZZZZ', sealed.salt), /bad decrypt|Unsupported state|authenticate/i);
  assert.throws(() => openToken(sealed.blob, 'ABCD2345', sealToken(token, 'ABCD2345').salt), /bad decrypt|Unsupported state|authenticate/i);
});

test('Host sharing keeps the same token on the second machine', async (t) => {
  let store = { token: 'a'.repeat(43), status: 'online', paused: false };
  const calls = [];
  const call = async (method, path, options) => {
    calls.push({ method, path, data: options?.data });
    if (path === '/api/transfers') return { mode: 'share', expiresAt: Date.now() + 600_000 };
    if (path === '/api/transfers/claim') {
      // Echo back what the Host sealed, as the real service would.
      const sealed = calls.find((c) => c.path === '/api/transfers').data;
      return { mode: 'share', blob: sealed.blob, salt: sealed.salt };
    }
    if (path === '/api/me') return { user: { id: 'u1', name: 'Alice', code: 'A'.repeat(18) } };
    if (path === '/api/friends') return { friends: [], incoming: [], outgoing: [] };
    return { ok: true };
  };
  const first = createAgent({ store: { read: async () => store, write: async (v) => { store = v; } }, call, deviceId: 'host-a', schedule: () => 0, unschedule() {} });
  t.after(() => first.dispose());
  await first.start();
  const minted = await first.transferStart('share');
  assert.equal(minted.mode, 'share');
  assert.match(minted.code, /^[A-HJ-NP-Z2-9]{8}$/);

  const seal = calls.find((c) => c.path === '/api/transfers').data;
  assert.equal('token' in seal, false, 'only ciphertext leaves this machine');
  const claim = calls.find((c) => c.path === '/api/transfers/claim');
  assert.equal(claim, undefined, 'minting does not claim anything');

  // A second Host starts empty and claims the code.
  let secondStore;
  const second = createAgent({ store: { read: async () => secondStore, write: async (v) => { secondStore = v; } }, call, deviceId: 'host-b', schedule: () => 0, unschedule() {} });
  t.after(() => second.dispose());
  await second.start();
  const view = await second.transferClaim(minted.code);
  assert.equal(view.hasIdentity, true);
  assert.equal(secondStore.token, 'a'.repeat(43), 'both machines hold the same token');
  assert.equal(store.token, 'a'.repeat(43), 'and the first machine is untouched');
});
