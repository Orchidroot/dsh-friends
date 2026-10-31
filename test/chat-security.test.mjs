import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { createFriendsService } from '../server/service.mjs';
import { createUpstream, createAgent } from '../plugin/host.mjs';
for (const operation of ['send', 'read']) test(`revoking friendship while ${operation} body is pending must forbid the write`, async (t) => {
  const app = createFriendsService({ database: ':memory:' });
  await new Promise((done) => app.server.listen(0, '127.0.0.1', done));
  t.after(() => app.close());
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  const call = createUpstream(origin);
  const a = await call('POST', '/api/register', { data: { name: 'A' } });
  const b = await call('POST', '/api/register', { data: { name: 'B' } });
  await call('POST', '/api/requests', { token: a.token, data: { code: b.user.code } });
  const incoming = await call('GET', '/api/friends', { token: b.token });
  await call('POST', `/api/requests/${incoming.incoming[0].id}`, { token: b.token, data: { action: 'accept' } });
  const path = `/api/chats/${b.user.id}${operation === 'read' ? '/read' : ''}`;
  const body = JSON.stringify(operation === 'read' ? { upTo: 1 } : { body: 'must not be stored after revocation', clientId: 'slow-post-001' });
  const reachedHandler = new Promise((resolve) => {
    const listener = (req) => {
      if (req.url === path && req.method === 'POST') { app.server.off('request', listener); resolve(); }
    };
    app.server.on('request', listener);
  });
  let req;
  const response = new Promise((resolve, reject) => {
    req = request(origin + path, { method: 'POST', headers: { Authorization: `Bearer ${a.token}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, (res) => {
      let text = ''; res.on('data', (chunk) => text += chunk); res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(text) }));
    });
    req.on('error', reject); req.flushHeaders();
  });
  await reachedHandler;
  await call('DELETE', `/api/friends/${b.user.id}`, { token: a.token });
  req.end(body);
  assert.equal((await response).status, operation === 'read' ? 404 : 403);
});

test('older markRead RPC response must not overwrite newer SSE read state', async (t) => {
  let onEvent, resolveRead;
  const friend = { id: 'peer', name: 'Peer', code: '', unread: 2, lastMessage: { id: 5, from: 'peer', to: 'self', body: 'fifth', at: 1 } };
  const agent = createAgent({
    store: { read: async () => ({ token: 'a'.repeat(43) }), write: async () => {} },
    deviceId: 'fake-device', schedule: () => 1, unschedule: () => {},
    connect: (options) => { onEvent = options.onEvent; return { close() {} }; },
    call: async (_method, path) => {
      if (path === '/api/me') return { user: { id: 'self', name: 'Self' } };
      if (path === '/api/friends') return { friends: [friend], incoming: [], outgoing: [] };
      if (path === '/api/chats/peer/read') return new Promise((resolve) => { resolveRead = resolve; });
      return { ok: true };
    },
  });
  t.after(() => agent.dispose());
  await agent.start();
  const pending = agent.markRead('peer', 4);
  onEvent('read', { reader: 'self', peer: 'peer', upTo: 5, unread: 0 });
  assert.equal(agent.view().friends[0].unread, 0);
  resolveRead({ ok: true, upTo: 4, unread: 1 });
  await pending;
  assert.equal(agent.view().friends[0].unread, 0);
});
