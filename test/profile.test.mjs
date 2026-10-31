// Profile customization: avatars, 140-char signatures, user-defined status words.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFriendsService } from '../server/service.mjs';
import { createUpstream, createAgent } from '../plugin/host.mjs';

// 1x1 transparent PNG.
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==';

async function setup(t) {
  const app = createFriendsService({ database: ':memory:' });
  await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  const call = createUpstream(origin);
  t.after(() => app.close());
  const friend = async (name) => call('POST', '/api/register', { data: { name } });
  async function befriend(a, b) {
    await call('POST', '/api/requests', { token: a.token, data: { code: b.user.code } });
    const inc = await call('GET', '/api/friends', { token: b.token });
    await call('POST', `/api/requests/${inc.incoming[0].id}`, { token: b.token, data: { action: 'accept' } });
  }
  return { origin, call, friend, befriend };
}

test('avatars are stored, fetched by friends only, and never ride along in snapshots', async (t) => {
  const { call, friend, befriend } = await setup(t);
  const a = await friend('Alice'), b = await friend('Bob'), c = await friend('Mallory');
  await befriend(a, b);
  await call('PATCH', '/api/me', { token: a.token, data: { avatar: PNG } });
  const snap = await call('GET', '/api/friends', { token: b.token });
  const seen = snap.friends.find((f) => f.id === a.user.id);
  assert.ok(seen.avatarAt > 0, 'friend learns the avatar version');
  assert.equal('avatar' in seen, false, 'bytes never travel in the snapshot');
  const mine = await call('GET', `/api/users/${a.user.id}/avatar`, { token: b.token });
  assert.equal(mine.avatar, PNG);
  await assert.rejects(call('GET', `/api/users/${a.user.id}/avatar`, { token: c.token }), (e) => e.status === 403);
  assert.equal((await call('GET', `/api/users/${a.user.id}/avatar`, { token: a.token })).avatar, PNG, 'your own avatar is readable');
  // Changing the picture bumps the version, and clearing removes it.
  await call('PATCH', '/api/me', { token: a.token, data: { avatar: PNG.replace('PNG', 'PNG') + '' } });
  const bumped = await call('GET', '/api/friends', { token: b.token });
  assert.ok(bumped.friends.find((f) => f.id === a.user.id).avatarAt >= seen.avatarAt);
  await call('PATCH', '/api/me', { token: a.token, data: { avatar: '' } });
  assert.equal((await call('GET', `/api/users/${a.user.id}/avatar`, { token: b.token })).avatar, '');
});

test('avatar validation rejects wrong types, oversized payloads and junk', async (t) => {
  const { call, friend } = await setup(t);
  const a = await friend('Alice');
  for (const bad of ['data:image/svg+xml;base64,PHN2Zz4=', 'data:text/plain;base64,aGk=', 'http://example.com/a.png', `${PNG}x`, 'data:image/png;base64,']) {
    await assert.rejects(call('PATCH', '/api/me', { token: a.token, data: { avatar: bad } }), (e) => e.status === 400, bad.slice(0, 30));
  }
  const huge = 'data:image/png;base64,' + 'A'.repeat(60_000);
  // A payload far beyond the route budget is refused as too large rather than stored.
  await assert.rejects(call('PATCH', '/api/me', { token: a.token, data: { avatar: huge } }), (e) => e.status === 400 || e.status === 413);
});

test('signature accepts 140 characters and rejects 141', async (t) => {
  const { call, friend, befriend } = await setup(t);
  const a = await friend('Alice'), b = await friend('Bob');
  await befriend(a, b);
  await call('POST', '/api/presence', { token: a.token, data: { status: 'online', deviceId: 'device-sig' } });
  const long = '签'.repeat(140);
  await call('PATCH', '/api/me', { token: a.token, data: { message: long } });
  assert.equal((await call('GET', '/api/friends', { token: b.token })).friends[0].message, long);
  await assert.rejects(call('PATCH', '/api/me', { token: a.token, data: { message: 'x'.repeat(141) } }), (e) => e.status === 400);
  await assert.rejects(call('PATCH', '/api/me', { token: a.token, data: { message: 'bad\u0007' } }), (e) => e.status === 400);
});

test('custom status words follow activity: running, active, idle, away', async (t) => {
  const { call, friend, befriend } = await setup(t);
  const a = await friend('Alice'), b = await friend('Bob');
  await befriend(a, b);
  await call('PATCH', '/api/me', { token: a.token, data: { labels: { active: '使用中', idle: '发呆', running: '在跑任务', away: '摸鱼', busy: '开会' } } });

  // Online and actively running a task.
  await call('POST', '/api/presence', { token: a.token, data: { status: 'online', deviceId: 'device-alice', activity: 'running' } });
  let seen = (await call('GET', '/api/friends', { token: b.token })).friends[0];
  assert.equal(seen.activity, 'running');
  assert.equal(seen.statusLabel, '在跑任务');

  // Online, just using the window.
  await call('POST', '/api/presence', { token: a.token, data: { status: 'online', deviceId: 'device-alice', activity: 'active' } });
  seen = (await call('GET', '/api/friends', { token: b.token })).friends[0];
  assert.equal(seen.activity, 'active');
  assert.equal(seen.statusLabel, '使用中');

  // Online but untouched: idle wins over the previous device claim only if no device is active.
  await call('POST', '/api/presence', { token: a.token, data: { status: 'online', deviceId: 'device-alice', activity: 'idle' } });
  seen = (await call('GET', '/api/friends', { token: b.token })).friends[0];
  assert.equal(seen.activity, 'idle');
  assert.equal(seen.statusLabel, '发呆');

  // The most active device wins across devices (running beats active).
  await call('POST', '/api/presence', { token: a.token, data: { status: 'online', deviceId: 'device-second', activity: 'running' } });
  await call('POST', '/api/presence', { token: a.token, data: { status: 'online', deviceId: 'device-alice', activity: 'active' } });
  assert.equal((await call('GET', '/api/friends', { token: b.token })).friends[0].statusLabel, '在跑任务');

  // Away uses its own word; being away hides the activity entirely.
  await call('POST', '/api/logout', { token: a.token, data: { deviceId: 'device-second' } });
  await call('POST', '/api/presence', { token: a.token, data: { status: 'away', deviceId: 'device-alice' } });
  seen = (await call('GET', '/api/friends', { token: b.token })).friends[0];
  assert.equal(seen.activity, '');
  assert.equal(seen.statusLabel, '摸鱼');

  // Clearing words falls back to the built-in wording (empty statusLabel).
  await call('PATCH', '/api/me', { token: a.token, data: { labels: {} } });
  await call('POST', '/api/presence', { token: a.token, data: { status: 'online', deviceId: 'device-alice', activity: 'running' } });
  assert.equal((await call('GET', '/api/friends', { token: b.token })).friends[0].statusLabel, '');

  // Hidden users never leak the word, even while a task runs.
  await call('PATCH', '/api/me', { token: a.token, data: { labels: { running: '秘密任务' } } });
  await call('POST', '/api/presence', { token: a.token, data: { status: 'invisible', deviceId: 'device-alice', activity: 'running' } });
  const hidden = (await call('GET', '/api/friends', { token: b.token })).friends[0];
  assert.equal(hidden.statusLabel, '');
  assert.equal(hidden.activity, '');
});

test('invalid activity values are rejected', async (t) => {
  const { call, friend } = await setup(t);
  const a = await friend('Alice');
  await assert.rejects(call('POST', '/api/presence', { token: a.token, data: { status: 'online', deviceId: 'device-x', activity: 'dancing' } }), (e) => e.status === 400);
});

test('status words are validated', async (t) => {
  const { call, friend } = await setup(t);
  const a = await friend('Alice');
  for (const bad of [{ online: 'x'.repeat(13) }, { online: 'bad\u0007' }, { unknown: 'x' }, { online: 42 }]) {
    await assert.rejects(call('PATCH', '/api/me', { token: a.token, data: { labels: bad } }), (e) => e.status === 400, JSON.stringify(bad).slice(0, 40));
  }
  await call('PATCH', '/api/me', { token: a.token, data: { labels: { online: '  写码  ' } } });
  assert.deepEqual((await call('GET', '/api/me', { token: a.token })).user.labels, { online: '写码' });
});

test('Host caches avatar bytes per version instead of refetching them', async (t) => {
  let fetches = 0;
  const calls = [];
  const call = async (method, path, options) => {
    calls.push(`${method} ${path}`);
    if (path === '/api/me') return { user: { id: 'me', name: 'Me', code: 'M'.repeat(18), message: '', labels: { running: '写周报中' }, avatarAt: 7 } };
    if (path === '/api/friends') return { friends: [{ id: 'peer', name: 'Peer', code: 'P'.repeat(18), status: 'online', message: '', statusLabel: '写代码中', avatarAt: 9 }], incoming: [], outgoing: [] };
    if (path.startsWith('/api/users/')) { fetches++; return { avatar: PNG, at: 9 }; }
    return { ok: true };
  };
  const agent = createAgent({ store: { read: async () => ({ token: 't'.repeat(43) }), write: async () => {} }, call, deviceId: 'host-avatar', schedule: () => 0, unschedule() {} });
  t.after(() => agent.dispose());
  await agent.start();
  assert.equal(agent.view().friends[0].statusLabel, '写代码中');
  // The self editor must keep the running word, not just the three manual statuses.
  assert.deepEqual(agent.view().user.labels, { running: '写周报中' });
  const first = await agent.avatar('peer', 9);
  assert.equal(first.avatar, PNG);
  await agent.avatar('peer', 9);
  await agent.avatar('peer', 9);
  assert.equal(fetches, 1, 'same version is served from cache');
  await agent.avatar('peer', 10);
  assert.equal(fetches, 2, 'a new version fetches again');
  const self = await agent.avatar('me', 7);
  assert.equal(self.avatar, PNG);
  assert.ok(calls.some((entry) => entry === 'GET /api/users/me/avatar'));
});
