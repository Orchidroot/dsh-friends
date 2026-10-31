import { randomUUID } from 'node:crypto';

export function sanitizeMessage(m) {
  if (!Number.isSafeInteger(m?.id) || m.id < 1 || typeof m?.from !== 'string' || typeof m?.to !== 'string' || typeof m?.body !== 'string') return null;
  return { id: m.id, from: m.from.slice(0,80), to: m.to.slice(0,80), body: [...m.body].slice(0,2000).join(''), at: Number.isSafeInteger(m.at) ? m.at : 0 };
}

/** Private Host event buffer. It never contains credentials; it is reset on identity changes. */
export function createChatHub({ context, replaceLists, changed, call, connect, assertIdentity, error, now = Date.now }) {
  let token = '', epoch = randomUUID(), seq = 0, log = [], connection, closed = false;
  let streamVersion = 0;
  const waiters = new Set(), seen = new Set();
  const snapshotWater = new Map(), readWater = new Map();
  const wake = () => { for (const fn of [...waiters]) fn(); };
  function emit(kind,data) { log.push({ seq: ++seq, kind, data }); log = log.slice(-200); wake(); }
  function same(version) { const ctx = context(); if (ctx.disposed || ctx.generation !== version || ctx.token !== token) throw error(409,'identity-changed'); return ctx; }
  function observeSnapshot(lists) {
    const ids = new Set();
    for (const f of lists?.friends ?? []) {
      ids.add(f.id); snapshotWater.set(f.id,Number.isSafeInteger(f.lastMessage?.id) ? f.lastMessage.id : 0);
    }
    for (const key of snapshotWater.keys()) if(!ids.has(key)) { snapshotWater.delete(key); readWater.delete(key); }
  }
  function receiveMessage(raw) {
    const m = sanitizeMessage(raw); if (!m || seen.has(m.id)) return;
    const ctx = context(); if (!ctx.user || ![m.from,m.to].includes(ctx.user.id)) return;
    const peer = m.from === ctx.user.id ? m.to : m.from;
    const friend = ctx.lists.friends.find((f) => f.id === peer); if (!friend) return;
    seen.add(m.id); if (seen.size > 2048) seen.delete(seen.values().next().value);
    streamVersion++; // also invalidates older in-flight polls when the SSE stream is disconnected
    replaceLists({ ...ctx.lists, friends: ctx.lists.friends.map((f) => f.id !== peer ? f : ({ ...f,
      lastMessage: !f.lastMessage || f.lastMessage.id <= m.id ? m : f.lastMessage,
      unread: (f.unread ?? 0) + (m.from === peer && m.id > (snapshotWater.get(peer) ?? 0) && m.id > (readWater.get(peer) ?? 0) ? 1 : 0),
    })) });
    emit('message',m); changed();
  }
  function onEvent(kind,data,version,expected) {
    const ctx = context();
    if (closed || ctx.disposed || ctx.generation !== version || ctx.token !== expected) return;
    streamVersion++;
    if (kind === 'snapshot') {
      replaceLists(data); observeSnapshot(context().lists); emit('snapshot',null); changed();
    } else if (kind === 'message') receiveMessage(data);
    else if (kind === 'read' && Number.isSafeInteger(data?.upTo) && data.upTo >= 0) {
      if (data.reader === ctx.user?.id) {
        readWater.set(data.peer,Math.max(readWater.get(data.peer) ?? 0,data.upTo));
        replaceLists({ ...ctx.lists, friends: ctx.lists.friends.map((f) => f.id !== data.peer ? f : ({ ...f, unread: Number.isSafeInteger(data.unread) ? Math.max(0,data.unread) : f.unread })) });
      } else if (!ctx.lists.friends.some((f) => f.id === data.reader)) return;
      emit('read', { reader: String(data.reader ?? '').slice(0,80), peer: data.peer ? String(data.peer).slice(0,80) : undefined, upTo: data.upTo }); changed();
    }
  }
  function sync() {
    const ctx = context(); const next = ctx.disposed ? '' : ctx.token ?? '';
    if (next === token || closed) return;
    connection?.close(); connection = null; token = next;
    epoch = randomUUID(); seq = 0; log = []; seen.clear(); snapshotWater.clear(); readWater.clear(); streamVersion++;
    wake();
    if (token && connect) {
      const expected = token, version = ctx.generation;
      connection = connect({ token, onEvent: (kind,data) => onEvent(kind,data,version,expected) });
    }
  }
  async function history(friendId,before,after) {
    const id = assertIdentity(); const version = context().generation;
    if (typeof friendId !== 'string' || !/^[A-Za-z0-9-]{1,80}$/.test(friendId)) throw error(400,'invalid');
    for (const n of [before,after]) if (n !== undefined && (!Number.isSafeInteger(n) || n < 0)) throw error(400,'invalid');
    const query = new URLSearchParams({ limit: after ? '100' : '50' });
    if (before) query.set('before',String(before)); if (after) query.set('after',String(after));
    const result = await call('GET',`/api/chats/${friendId}?${query}`,{ token: id.token }); same(version);
    return { messages: (Array.isArray(result.messages) ? result.messages : []).slice(0,100).map(sanitizeMessage).filter(Boolean), more: result.more === true, peerRead: Number.isSafeInteger(result.peerRead) ? result.peerRead : 0 };
  }
  async function send(friendId,body,clientId) {
    const id = assertIdentity(); const version = context().generation;
    if (typeof friendId !== 'string' || !/^[A-Za-z0-9-]{1,80}$/.test(friendId)) throw error(400,'invalid');
    if (typeof body !== 'string' || !body.trim() || [...body].length > 2000) throw error(400,'invalid-message');
    if (typeof clientId !== 'string' || !/^[A-Za-z0-9_-]{8,80}$/.test(clientId)) throw error(400,'invalid-client-id');
    const result = await call('POST',`/api/chats/${friendId}`,{ token: id.token, data: { body,clientId } }); same(version);
    const m = sanitizeMessage(result.message); if (!m) throw error(502,'bad-upstream');
    receiveMessage(m); return { message: m };
  }
  async function markRead(friendId,upTo) {
    const id = assertIdentity(); const version = context().generation;
    if (typeof friendId !== 'string' || !/^[A-Za-z0-9-]{1,80}$/.test(friendId) || !Number.isSafeInteger(upTo) || upTo < 0) throw error(400,'invalid');
    const observedLists = context().lists, stamp = streamVersion;
    const result = await call('POST',`/api/chats/${friendId}/read`,{ token: id.token,data: { upTo } }); const ctx = same(version);
    // A newer SSE receipt/message or snapshot already has a more recent unread count.
    // Never let this older HTTP reply erase it (including replies from another open window).
    if (stamp === streamVersion && ctx.lists === observedLists) {
      readWater.set(friendId,Math.max(readWater.get(friendId) ?? 0,Number.isSafeInteger(result.upTo) ? result.upTo : 0));
      streamVersion++; // local acknowledgements must also invalidate any older GET snapshot
      replaceLists({ ...ctx.lists, friends: ctx.lists.friends.map((f) => f.id !== friendId ? f : ({ ...f, unread: Number.isSafeInteger(result.unread) ? Math.max(0,result.unread) : f.unread })) });
      changed();
    }
    return { ok:true, upTo:result.upTo };
  }
  async function wait(since,revisionSeen,timeoutMs,signal) {
    const ctx = context(); ctx.watch();
    if (waiters.size >= 32) throw error(429,'too-many-windows');
    since = Number.isSafeInteger(since) && since >= 0 ? since : 0;
    if (!closed && seq <= since && ctx.revision === revisionSeen && !signal?.aborted) {
      await new Promise((resolve) => {
        const done = () => { clearTimeout(timer); waiters.delete(done); signal?.removeEventListener('abort',done); resolve(); };
        const timer = setTimeout(done,Math.max(0,Math.min(timeoutMs ?? 20000,20000))); timer.unref?.();
        waiters.add(done); signal?.addEventListener('abort',done,{ once:true });
      });
    }
    const events = log.filter((e) => e.seq > since).slice(0,100);
    return { ...context().view(), events, cursor: events.at(-1)?.seq ?? seq, inboxEpoch:epoch, gap: log.length > 0 && since < log[0].seq-1 };
  }
  return {
    sync, history, send, markRead, wait, wake, observeSnapshot,
    get epoch() { return epoch; }, get stamp() { return streamVersion; },
    close() { closed = true; connection?.close(); connection = null; wake(); },
  };
}
