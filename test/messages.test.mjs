import test from 'node:test';
import assert from 'node:assert/strict';
import { createFriendsService } from '../server/service.mjs';
import { createUpstream } from '../plugin/host.mjs';

async function setup(t, options = {}) {
  let now = 1_800_000_000_000;
  const app = createFriendsService({ database: ':memory:', clock: () => now++, ...options });
  await new Promise((done) => app.server.listen(0, '127.0.0.1', done));
  t.after(() => app.close());
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  const call = createUpstream(origin);
  const register = (name) => call('POST', '/api/register', { data: { name } });
  async function befriend(a, b) {
    await call('POST', '/api/requests', { token: a.token, data: { code: b.user.code } });
    const inc = await call('GET', '/api/friends', { token: b.token });
    await call('POST', `/api/requests/${inc.incoming[0].id}`, { token: b.token, data: { action: 'accept' } });
  }
  return { app, origin, call, register, befriend };
}

test('friends can exchange messages, including while the recipient is offline', async (t) => {
  const { call, register, befriend } = await setup(t);
  const a = await register('Alice'), b = await register('Bob');
  await befriend(a, b);
  const sent = await call('POST', `/api/chats/${b.user.id}`, { token: a.token, data: { body: '  晚上一起玩吗？\r\n第二行  ' } });
  assert.equal(sent.message.body, '晚上一起玩吗？\n第二行');
  assert.equal(sent.message.from, a.user.id);
  await call('POST', `/api/chats/${a.user.id}`, { token: b.token, data: { body: '好啊 🎮' } });
  const history = await call('GET', `/api/chats/${b.user.id}`, { token: a.token });
  assert.deepEqual(history.messages.map((m) => m.body), ['晚上一起玩吗？\n第二行', '好啊 🎮']);
  assert.equal(history.more, false);
});

test('unread counts, last-message preview and read receipts', async (t) => {
  const { call, register, befriend } = await setup(t);
  const a = await register('Alice'), b = await register('Bob');
  await befriend(a, b);
  for (const body of ['1', '2', '3']) await call('POST', `/api/chats/${b.user.id}`, { token: a.token, data: { body } });
  let bob = (await call('GET', '/api/friends', { token: b.token })).friends[0];
  assert.equal(bob.unread, 3);
  assert.equal(bob.lastMessage.body, '3');
  // The sender's own messages never count as unread for the sender.
  assert.equal((await call('GET', '/api/friends', { token: a.token })).friends[0].unread, 0);
  const history = await call('GET', `/api/chats/${a.user.id}`, { token: b.token });
  const second = history.messages[1].id;
  await call('POST', `/api/chats/${a.user.id}/read`, { token: b.token, data: { upTo: second } });
  bob = (await call('GET', '/api/friends', { token: b.token })).friends[0];
  assert.equal(bob.unread, 1);
  // Sender sees how far the peer has read.
  assert.equal((await call('GET', `/api/chats/${b.user.id}`, { token: a.token })).peerRead, second);
  // A read mark beyond the latest message is clamped; it can never move backwards.
  await call('POST', `/api/chats/${a.user.id}/read`, { token: b.token, data: { upTo: 9_999_999 } });
  await call('POST', `/api/chats/${a.user.id}/read`, { token: b.token, data: { upTo: 0 } });
  assert.equal((await call('GET', '/api/friends', { token: b.token })).friends[0].unread, 0);
  assert.equal((await call('GET', `/api/chats/${b.user.id}`, { token: a.token })).peerRead, history.messages[2].id);
});

test('only friends can message or read a conversation', async (t) => {
  const { call, register, befriend } = await setup(t);
  const a = await register('Alice'), b = await register('Bob'), c = await register('Mallory');
  await befriend(a, b);
  await call('POST', `/api/chats/${b.user.id}`, { token: a.token, data: { body: 'private' } });
  await assert.rejects(call('POST', `/api/chats/${a.user.id}`, { token: c.token, data: { body: 'spam' } }), (e) => e.status === 403);
  await assert.rejects(call('GET', `/api/chats/${a.user.id}`, { token: c.token }), (e) => e.status === 404);
  await assert.rejects(call('GET', `/api/chats/${b.user.id}`, { token: c.token }), (e) => e.status === 404);
  await assert.rejects(call('POST', `/api/chats/${a.user.id}/read`, { token: c.token, data: { upTo: 1 } }), (e) => e.status === 404);
  // Pending friend requests do not grant messaging either.
  await call('POST', '/api/requests', { token: c.token, data: { code: a.user.code } });
  await assert.rejects(call('POST', `/api/chats/${a.user.id}`, { token: c.token, data: { body: 'hi' } }), (e) => e.status === 403);
});

test('removing a friend deletes the conversation for both sides', async (t) => {
  const { call, register, befriend } = await setup(t);
  const a = await register('Alice'), b = await register('Bob');
  await befriend(a, b);
  await call('POST', `/api/chats/${b.user.id}`, { token: a.token, data: { body: 'secret' } });
  await call('DELETE', `/api/friends/${b.user.id}`, { token: a.token });
  await befriend(a, b);
  const history = await call('GET', `/api/chats/${b.user.id}`, { token: b.token === a.token ? a.token : a.token });
  assert.deepEqual(history.messages, []);
  assert.equal((await call('GET', '/api/friends', { token: b.token })).friends[0].unread, 0);
});

test('message validation, rate limit and history pagination', async (t) => {
  const { call, register, befriend } = await setup(t, { messageLimitMinute: 200, messageKeep: 150 });
  const a = await register('Alice'), b = await register('Bob');
  await befriend(a, b);
  for (const body of ['', '   ', 'x'.repeat(2001), 'bell\u0007', 'bidi\u202e', 42]) {
    await assert.rejects(call('POST', `/api/chats/${b.user.id}`, { token: a.token, data: { body } }), (e) => e.status === 400, JSON.stringify(body));
  }
  // Emoji with joiners are allowed.
  await call('POST', `/api/chats/${b.user.id}`, { token: a.token, data: { body: '👨‍👩‍👧 ❤️' } });
  for (let i = 0; i < 160; i++) await call('POST', `/api/chats/${b.user.id}`, { token: a.token, data: { body: `m${i}` } });
  const page1 = await call('GET', `/api/chats/${b.user.id}?limit=50`, { token: a.token });
  assert.equal(page1.messages.length, 50);
  assert.equal(page1.messages.at(-1).body, 'm159');
  assert.equal(page1.more, true);
  const page2 = await call('GET', `/api/chats/${b.user.id}?limit=50&before=${page1.messages[0].id}`, { token: a.token });
  assert.equal(page2.messages.at(-1).id < page1.messages[0].id, true);
  // Retention: only the newest 150 remain.
  let total = 0; let before = 0;
  for (;;) {
    const page = await call('GET', `/api/chats/${b.user.id}?limit=100${before ? `&before=${before}` : ''}`, { token: a.token });
    total += page.messages.length;
    if (!page.more) break;
    before = page.messages[0].id;
  }
  assert.equal(total, 150);
  // After-cursor returns only newer messages in order.
  const tail = await call('GET', `/api/chats/${b.user.id}?after=${page1.messages.at(-3).id}`, { token: a.token });
  assert.deepEqual(tail.messages.map((m) => m.body), ['m158', 'm159']);
  await assert.rejects(call('GET', `/api/chats/${b.user.id}?before=-1`, { token: a.token }), (e) => e.status === 400);
});

test('message rate limit protects friends from floods', async (t) => {
  const { call, register, befriend } = await setup(t, { messageLimitMinute: 5 });
  const a = await register('Alice'), b = await register('Bob');
  await befriend(a, b);
  for (let i = 0; i < 5; i++) await call('POST', `/api/chats/${b.user.id}`, { token: a.token, data: { body: `${i}` } });
  await assert.rejects(call('POST', `/api/chats/${b.user.id}`, { token: a.token, data: { body: 'flood' } }), (e) => e.status === 429);
});

test('live streams deliver messages and read receipts only to the two participants', async (t) => {
  const { origin, call, register, befriend } = await setup(t);
  const a = await register('Alice'), b = await register('Bob'), c = await register('Carol');
  await befriend(a, b); await befriend(a, c);
  const open = async (token) => {
    const abort = new AbortController();
    const response = await fetch(origin + '/api/events', { headers: { Authorization: `Bearer ${token}` }, signal: abort.signal });
    const reader = response.body.getReader(); let buffer = '';
    const events = [];
    (async () => { try { for (;;) { const { value, done } = await reader.read(); if (done) break; buffer += new TextDecoder().decode(value); let i; while ((i = buffer.indexOf('\n\n')) >= 0) { const chunk = buffer.slice(0, i); buffer = buffer.slice(i + 2); const ev = /event: (\w+)/.exec(chunk)?.[1]; const data = /data: (.*)/.exec(chunk)?.[1]; if (ev) events.push({ ev, data: data && JSON.parse(data) }); } } } catch {} })();
    t.after(() => abort.abort());
    return events;
  };
  const bobEvents = await open(b.token); const carolEvents = await open(c.token);
  await new Promise((r) => setTimeout(r, 30));
  const sent = await call('POST', `/api/chats/${b.user.id}`, { token: a.token, data: { body: 'just for bob' } });
  await call('POST', `/api/chats/${a.user.id}/read`, { token: b.token, data: { upTo: sent.message.id } });
  await new Promise((r) => setTimeout(r, 50));
  assert.ok(bobEvents.some((e) => e.ev === 'message' && e.data.body === 'just for bob'));
  assert.ok(!carolEvents.some((e) => e.ev === 'message' || e.ev === 'read'), 'third parties see nothing');
  assert.ok(!JSON.stringify(carolEvents).includes('just for bob'));
});

test('deleting an account removes its messages', async (t) => {
  const { call, register, befriend } = await setup(t);
  const a = await register('Alice'), b = await register('Bob');
  await befriend(a, b);
  await call('POST', `/api/chats/${b.user.id}`, { token: a.token, data: { body: 'bye' } });
  await call('DELETE', '/api/me', { token: a.token });
  assert.deepEqual((await call('GET', '/api/friends', { token: b.token })).friends, []);
});
