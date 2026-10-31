// Controller/event-handler behavior tests with a fake clock and RPC transport.
// This is deliberately NOT a DOM renderer or a real-browser layout test.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { randomUUID } from 'node:crypto';

const source = await readFile(new URL('../plugin/client.js', import.meta.url), 'utf8');
const flush = () => new Promise((resolve) => setImmediate(resolve));
const message = (id, from = 'bob', body = `message ${id}`) => ({ id, from, to: from === 'me' ? 'bob' : 'me', body, at: 1793400000000 + id });
const base = (patch = {}) => ({ revision: 1, hasIdentity: true, user: { id: 'me', name: 'Me', code: 'PUBLICCODE00000000', message: '' }, friends: [{ id: 'bob', name: 'Bob', code: 'BOB000000000000000', status: 'offline', unread: 0, lastMessage: null }], incoming: [], outgoing: [], status: 'online', effectiveStatus: 'online', paused: false, link: 'connected', error: '', serviceUrl: 'http://friends.test', ...patch });
const withLast = (msg, unread = 1, revision = msg.id) => base({ revision, friends: [{ ...base().friends[0], lastMessage: msg, unread }] });

function hooks() {
  const frames = new Map(); let current;
  const React = {
    Fragment: Symbol('Fragment'),
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useSyncExternalStore(_subscribe, get) { return get(); },
    useState(initial) { const value = React.useRef(typeof initial === 'function' ? initial() : initial); return [value.current, (v) => { value.current = typeof v === 'function' ? v(value.current) : v; }]; },
    useRef(initial) { const i = current.index++; return current.refs[i] ||= { current: initial }; },
    useCallback(fn) { return fn; },
    useEffect() { /* Layout and browser lifecycle are not simulated. */ },
  };
  function render(element, path = 'root') {
    if (Array.isArray(element)) return element.map((child, i) => render(child, `${path}.${i}`));
    if (!element || typeof element !== 'object') return element;
    if (typeof element.type === 'function') {
      const key = `${path}:${element.type.name}:${element.props.key || ''}`;
      const frame = frames.get(key) || { refs: [] }; frame.index = 0; frames.set(key, frame); current = frame;
      return render(element.type(element.props), key);
    }
    return { ...element, props: { ...element.props, children: render(element.props.children, `${path}.${String(element.type)}`) } };
  }
  function find(tree, predicate, found = []) {
    if (Array.isArray(tree)) { for (const child of tree) find(child, predicate, found); }
    else if (tree && typeof tree === 'object') { if (predicate(tree)) found.push(tree); find(tree.props?.children, predicate, found); }
    return found;
  }
  const text = (tree) => Array.isArray(tree) ? tree.map(text).join(' ') : tree && typeof tree === 'object' ? tree.type === 'style' ? '' : text(tree.props.children) : String(tree ?? '');
  return { React, render, find, text };
}

async function fixture(t, { state = base(), history, send, rpc } = {}) {
  const { React, render, find, text } = hooks();
  let definition, timerId = 0, disposed = false;
  const slots = {}, calls = [], timers = new Map(), pendingWaits = [], disposers = [], events = new Map();
  const document = { baseURI: 'http://dsh.test/prefix/', visibilityState: 'visible', hasFocus: () => true, addEventListener(name, fn) { events.set(`document:${name}`, fn); }, removeEventListener(name) { events.delete(`document:${name}`); } };
  const window = { innerWidth: 1100, innerHeight: 800, __ModuleLoader__: { load(value) { definition = value; } }, addEventListener(name, fn) { events.set(`window:${name}`, fn); }, removeEventListener(name) { events.delete(`window:${name}`); } };
  const sandbox = {
    window, document, navigator: {}, URL, AbortController, AbortSignal, Response, Date, Math, JSON, crypto: { randomUUID },
    setTimeout(fn, ms) { const id = ++timerId; timers.set(id, { fn, ms }); return id; }, clearTimeout(id) { timers.delete(id); },
    fetch: async (url, options) => {
      const body = JSON.parse(options.body); calls.push({ url: String(url), options, body });
      if (rpc) { const result = await rpc(body); if (result) return result; }
      if (body.op === 'state') return Response.json(state);
      if (body.op === 'wait') return new Promise((resolve, reject) => {
        pendingWaits.push({ resolve, reject, body, signal: options.signal });
        options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      });
      if (body.op === 'history') return Response.json(await (history?.(body) || { messages: [], more: false, peerRead: 0 }));
      if (body.op === 'send') return send ? await send(body) : Response.json({ message: message(200, 'me', body.body) });
      if (body.op === 'markRead') return Response.json({ ok: true, upTo: body.upTo });
      return Response.json(state);
    },
  };
  // Instrument only this VM copy, not the shipped module or its public surface.
  vm.runInNewContext(source.replace('const controller = createController(t);', 'const controller = createController(t); globalThis.testController = controller;'), sandbox);
  const dictionaries = {};
  definition.factory((name) => { assert.equal(name, 'react'); return React; }).apply({
    effect(fn) { const dispose = fn(); if (typeof dispose === 'function') disposers.push(dispose); },
    locale: { register(_ns, dict) { Object.assign(dictionaries, dict.zh); return () => {}; }, bind: () => (key) => dictionaries[key] || key },
    slots: { inject(_name, fn) { fn(); }, register(options, component) { slots[options.name] = component; } },
  });
  await flush();
  function dispose() { if (disposed) return; disposed = true; for (const fn of disposers.reverse()) fn(); }
  t.after(dispose);
  async function startWait() {
    const timer = [...timers].find(([, value]) => value.ms <= 3000);
    assert.ok(timer, 'expected a scheduled serial wait/backoff'); timers.delete(timer[0]); timer[1].fn(); await flush();
    assert.equal(pendingWaits.length, 1, 'one wait in flight'); return pendingWaits[0];
  }
  async function answerWait(view, { events = [], cursor = 0, inboxEpoch = 'epoch-a' } = {}) {
    if (!pendingWaits.length) await startWait();
    pendingWaits.shift().resolve(Response.json({ ...view, events, cursor, inboxEpoch })); await flush();
  }
  const overlay = () => render(React.createElement(slots['shell.overlay']));
  return { controller: sandbox.testController, document, window, slots, React, render, find, text, overlay, calls, timers, pendingWaits, events, startWait, answerWait, dispose };
}

test('long polling seeds history silently, deduplicates events/snapshot messages and reseeds changed epochs', async (t) => {
  const old = message(5), fresh = message(6, 'bob', '<img src=x>\nhello');
  const f = await fixture(t, { state: withLast(old, 1) });
  assert.equal(f.controller.getToasts().length, 0);
  await f.answerWait(withLast(old), { events: [{ seq: 8, kind: 'message', data: old }], cursor: 8 });
  assert.equal(f.controller.getToasts().length, 0, 'first wait must not replay an inbox toast');
  await f.answerWait(withLast(fresh, 2), { events: [{ seq: 9, kind: 'message', data: fresh }, { seq: 9, kind: 'message', data: fresh }], cursor: 9 });
  assert.equal(f.controller.getToasts().length, 1, 'snapshot and duplicate events notify exactly once');
  assert.equal(f.controller.getToasts()[0].friendId, 'bob');
  assert.match(f.controller.getToasts()[0].text, /<img src=x>/);
  await f.answerWait(withLast(fresh, 2), { events: [{ seq: 9, kind: 'message', data: fresh }], cursor: 9 });
  assert.equal(f.controller.getToasts().length, 1);
  await f.answerWait(withLast(message(7)), { events: [{ seq: 1, kind: 'message', data: message(7) }], cursor: 1, inboxEpoch: 'epoch-b' });
  const next = await f.startWait(); assert.equal(next.body.since, 0);
  await f.answerWait(withLast(message(7)), { cursor: 1, inboxEpoch: 'epoch-b' });
  assert.equal(f.controller.getToasts().length, 1, 'new epoch is seeded without replay');
  await f.answerWait(withLast(message(8)), { events: [{ seq: 2, kind: 'message', data: message(8) }], cursor: 2, inboxEpoch: 'epoch-b' });
  assert.equal(f.controller.getToasts().length, 2);
  assert.ok(f.calls.every(({ url, options }) => url === 'http://dsh.test/prefix/api/dsh-friends.rpc' && options.credentials === 'same-origin'));
  assert.ok(f.calls.every(({ options }) => !('Authorization' in options.headers)));
});

test('wait is serial, failed waits back off and dispose aborts the pending request', async (t) => {
  const f = await fixture(t);
  const first = await f.startWait();
  f.events.get('window:focus')(); f.events.get('document:visibilitychange')(); await flush();
  assert.equal(f.calls.filter((c) => c.body.op === 'wait').length, 1);
  f.pendingWaits.shift().reject(new Error('offline')); await flush();
  assert.ok([...f.timers.values()].some((timer) => timer.ms === 3000));
  assert.equal(f.calls.filter((c) => c.body.op === 'state').length, 2, 'one serialized compatibility fallback');
  const second = await f.startWait(); assert.equal(first.signal.aborted, false);
  f.dispose(); await flush();
  assert.equal(second.signal.aborted, true); assert.equal(f.timers.size, 0); assert.equal(f.events.size, 0);
});

test('offline chat history paginates, merges live messages and never reduces a history result as a view', async (t) => {
  const f = await fixture(t, { history: ({ before }) => before ? { messages: [message(1)], more: false, peerRead: 1 } : { messages: [message(3), message(4, 'me')], more: true, peerRead: 4 } });
  f.controller.openChat('bob'); await flush();
  assert.equal(f.controller.getState().friends[0].status, 'offline');
  assert.deepEqual(Array.from(f.controller.getUI().chats.bob.messages, (m) => m.id), [3, 4]);
  await f.controller.loadHistory('bob', 3);
  assert.deepEqual(Array.from(f.controller.getUI().chats.bob.messages, (m) => m.id), [1, 3, 4]);
  assert.equal(f.controller.getUI().chats.bob.more, false);
  assert.equal(f.controller.getUI().chats.bob.peerRead, 4);
  assert.equal(f.calls.filter((c) => c.body.op === 'markRead').length, 0, 'loading alone does not mark anything read');
  await f.controller.run('history', { friendId: 'bob' });
  assert.equal(f.controller.getState().hasIdentity, true);
  await f.answerWait(base(), { cursor: 1 });
  await f.answerWait(withLast(message(5)), { events: [{ seq: 2, kind: 'message', data: message(5) }], cursor: 2 });
  assert.ok(f.controller.getUI().chats.bob.messages.some((m) => m.id === 5));
});

test('2000 Unicode characters, preserved multiline drafts and explicit idempotent retry', async (t) => {
  let attempts = 0;
  const f = await fixture(t, { send: async (body) => ++attempts === 1 ? Response.json({ error: 'unreachable' }, { status: 503 }) : Response.json({ message: message(50, 'me', body.body) }) });
  f.controller.openChat('bob'); await flush();
  f.controller.setDraft('bob', '😀'.repeat(2001)); await f.controller.sendMessage('bob');
  assert.equal(attempts, 0); assert.match(f.controller.getUI().chats.bob.error, /2000/);
  const body = 'line one\n' + '😀'.repeat(1991);
  assert.equal([...body].length, 2000);
  f.controller.setDraft('bob', body);
  await f.controller.sendMessage('bob');
  assert.equal(f.controller.getUI().chats.bob.draft, body);
  const failedId = f.controller.getUI().chats.bob.pending.clientId;
  assert.match(failedId, /^[0-9a-f-]{36}$/);
  await flush(); assert.equal(attempts, 1, 'failure must never automatically resend');
  f.controller.closeTab('bob'); f.controller.openChat('bob'); await flush();
  assert.equal(f.controller.getUI().chats.bob.pending.clientId, failedId);
  await f.controller.sendMessage('bob');
  const sends = f.calls.filter((c) => c.body.op === 'send');
  assert.equal(sends[0].body.clientId, sends[1].body.clientId); assert.equal(sends[0].body.body, sends[1].body.body);
  assert.equal(f.controller.getUI().chats.bob.draft, ''); assert.equal(f.controller.getUI().chats.bob.pending, null);
  assert.equal(f.controller.getState().hasIdentity, true);
  f.controller.setDraft('bob', 'another'); await f.controller.sendMessage('bob');
  assert.notEqual(f.calls.filter((c) => c.body.op === 'send').at(-1).body.clientId, failedId);
});

test('read watermarks require an active non-minimized chat, visible focused document and a rendered inbound id', async (t) => {
  const f = await fixture(t, { state: withLast(message(3)), history: () => ({ messages: [message(2), message(3, 'me')], more: false, peerRead: 0 }) });
  f.controller.openChat('bob'); await flush();
  for (const patch of [{ open: false }, { open: true, minimized: true }]) {
    f.controller.setWindow('chat', patch); await f.controller.reportVisible('bob', 2);
  }
  f.controller.setWindow('chat', { open: true, minimized: false });
  f.document.visibilityState = 'hidden'; await f.controller.reportVisible('bob', 2);
  f.document.visibilityState = 'visible'; f.document.hasFocus = () => false; await f.controller.reportVisible('bob', 2);
  f.document.hasFocus = () => true; await f.controller.reportVisible('bob', 3); await f.controller.reportVisible('bob', 99);
  assert.equal(f.calls.filter((c) => c.body.op === 'markRead').length, 0);
  await f.controller.reportVisible('bob', 2); await f.controller.reportVisible('bob', 2);
  assert.deepEqual(f.calls.filter((c) => c.body.op === 'markRead').map((c) => c.body.upTo), [2]);
});

test('overlay handlers move/resize/minimize/close without making a full-screen interactive backdrop', async (t) => {
  const f = await fixture(t);
  let tree = f.overlay();
  assert.equal(tree.props.style.pointerEvents, 'none');
  assert.match(source, /\.dsf-overlay>\*\{pointer-events:auto\}/);
  f.find(tree, (n) => n.props.className === 'dsf-launcher')[0].props.onClick();
  tree = f.overlay();
  // First open docks the window near the launcher rather than over the sidebar.
  const docked = { ...f.controller.getUI().friends };
  assert.ok(docked.x > 600, 'docked on the right: ' + docked.x);
  let dialog = f.find(tree, (n) => n.props.role === 'dialog')[0];
  assert.equal(dialog.props['aria-modal'], false);
  const header = f.find(dialog, (n) => n.props.className === 'dsf-titlebar')[0];
  const pointer = (x, y) => ({ button: 0, pointerId: 7, clientX: x, clientY: y, target: { closest: () => null }, currentTarget: { setPointerCapture() {} }, preventDefault() {} });
  header.props.onPointerDown(pointer(10, 10)); header.props.onPointerMove(pointer(90, 55)); header.props.onPointerUp();
  // Drag/resize stay inside the viewport; exact pixels depend on where the window docked.
  const moved = { ...f.controller.getUI().friends };
  assert.ok(moved.x >= docked.x && moved.y >= docked.y, 'drag moved right/down');
  assert.ok(moved.x + moved.width <= 1100 && moved.y + moved.height <= 800, 'drag stayed on screen');
  tree = f.overlay();
  const beforeResize = { ...f.controller.getUI().friends };
  const resize = f.find(tree, (n) => n.props.className === 'dsf-resize')[0];
  resize.props.onPointerDown(pointer(0, 0)); resize.props.onPointerMove(pointer(70, 60)); resize.props.onPointerUp();
  const resized = { ...f.controller.getUI().friends };
  assert.ok(resized.width >= beforeResize.width && resized.height > beforeResize.height, 'resize grew the window');
  assert.ok(resized.x + resized.width <= 1100 && resized.y + resized.height <= 800, 'resize stayed on screen');
  tree = f.overlay();
  f.find(tree, (n) => n.type === 'button' && n.props['aria-label'] === '最小化')[0].props.onClick();
  assert.equal(f.controller.getUI().friends.minimized, true);
  tree = f.overlay(); assert.equal(f.find(tree, (n) => n.props.role === 'dialog')[0].props.style.height, 40);
  f.find(tree, (n) => n.type === 'button' && n.props['aria-label'] === '关闭')[0].props.onClick();
  assert.equal(f.controller.getUI().friends.open, false);
  f.controller.openFriends(); assert.equal(f.controller.getUI().friends.minimized, false);
});

test('chat UI is plain text, handles IME/Shift+Enter, unread badges and clickable message toast', async (t) => {
  const unsafe = message(10, 'bob', '<img src=x onerror=alert(1)>\ntext');
  const f = await fixture(t, { state: withLast(unsafe, 3), history: () => ({ messages: [unsafe], more: false, peerRead: 0 }) });
  f.controller.openChat('bob'); await flush();
  let tree = f.overlay();
  assert.ok(f.text(tree).includes(unsafe.body));
  assert.equal(f.find(tree, (n) => n.type === 'img' || n.props.dangerouslySetInnerHTML).length, 0);
  assert.ok(f.find(tree, (n) => n.props.className === 'dsf-unread').length);
  let input = f.find(tree, (n) => n.type === 'textarea')[0];
  input.props.onChange({ target: { value: 'hello\nworld' } });
  const key = (patch = {}) => ({ key: 'Enter', shiftKey: false, preventDefault() {}, ...patch });
  input.props.onCompositionStart(); input.props.onKeyDown(key()); input.props.onCompositionEnd();
  input.props.onKeyDown(key({ isComposing: true })); input.props.onKeyDown(key({ nativeEvent: { isComposing: true } })); input.props.onKeyDown(key({ keyCode: 229 })); input.props.onKeyDown(key({ shiftKey: true }));
  await flush(); assert.equal(f.calls.filter((c) => c.body.op === 'send').length, 0);
  input.props.onKeyDown(key()); await flush(); assert.equal(f.calls.filter((c) => c.body.op === 'send').length, 1);
  f.controller.setWindow('chat', { minimized: true });
  await f.answerWait(withLast(unsafe, 3), { cursor: 1 });
  await f.answerWait(withLast(message(11), 4), { events: [{ seq: 2, kind: 'message', data: message(11) }], cursor: 2 });
  tree = f.overlay();
  const toast = f.find(tree, (n) => n.props.className === 'dsf-toast')[0];
  f.find(toast, (n) => n.type === 'button')[0].props.onClick(); await flush();
  assert.equal(f.controller.getUI().chat.minimized, false); assert.equal(f.controller.getUI().active, 'bob');
  assert.equal(f.controller.getToasts().length, 0);
});

test('removing the last friend closes the chat window instead of leaving it blank', async (t) => {
  const f = await fixture(t, { state: base() });
  f.controller.openChat('bob'); await flush();
  assert.equal(f.controller.getUI().chat.open, true);
  // The friend disappears (removed by either side): the float must not linger empty.
  await f.answerWait(base({ friends: [] }), { cursor: 0 });
  assert.equal(f.controller.getUI().tabs.length, 0);
  assert.equal(f.controller.getUI().chat.open, false);
  assert.equal(f.overlay().props.children.filter(Boolean).some((node) => node.props?.title === '聊天'), false);
});

test('multiple tabs and window geometry survive page-slot renders; identity disposal clears conversations', async (t) => {
  const bob = base().friends[0], carol = { ...bob, id: 'carol', name: 'Carol' };
  const f = await fixture(t, { state: base({ friends: [bob, carol] }) });
  f.controller.openChat('bob'); await flush(); f.controller.setDraft('bob', 'keep draft');
  f.controller.openChat('carol'); await flush();
  f.controller.setWindow('chat', { x: 145, y: 95 });
  f.render(f.React.createElement(f.slots.main)); f.render(f.React.createElement(f.slots.main));
  assert.deepEqual(Array.from(f.controller.getUI().tabs), ['bob', 'carol']);
  assert.equal(f.controller.getUI().chats.bob.draft, 'keep draft'); assert.equal(f.controller.getUI().chat.x, 145);
  await f.answerWait(base({ hasIdentity: false, user: null, friends: [] }), { cursor: 0 });
  assert.equal(f.controller.getUI().tabs.length, 0); assert.equal(Object.keys(f.controller.getUI().chats).length, 0); assert.equal(f.controller.getUI().chat.open, false);
});
