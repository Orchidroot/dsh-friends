// Renders the plugin's React components without a DOM: a minimal synchronous
// renderer that runs function components with real hook-order checks and walks
// the element tree. It catches crashes (a crashed slot blanks the DSH page),
// conditional-hook violations, missing keys on mapped children and text output.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

function createReact() {
  let current = null;
  const Fragment = Symbol('Fragment');
  const createElement = (type, props, ...children) => ({ type, props: { ...(props || {}), children: children.length === 1 ? children[0] : children } });
  const hook = (init) => {
    const frame = current;
    const index = frame.index++;
    if (frame.mounted && index >= frame.hooks.length) throw new Error('Rendered more hooks than during the previous render');
    if (!frame.mounted) frame.hooks.push(init());
    return frame.hooks[index];
  };
  const React = {
    Fragment, createElement,
    useState(initial) { const slot = hook(() => ({ value: typeof initial === 'function' ? initial() : initial })); return [slot.value, (v) => { slot.value = typeof v === 'function' ? v(slot.value) : v; }]; },
    useCallback(fn) { return hook(() => fn); },
    useEffect() { hook(() => null); },
    useSyncExternalStore(subscribe, get) { hook(() => null); return get(); },
  };
  const frames = new Map();
  function render(element, path = 'root') {
    if (element === null || element === undefined || element === false || element === true) return [];
    if (typeof element === 'string' || typeof element === 'number') return [String(element)];
    if (Array.isArray(element)) {
      if (element.length > 1 && element.some((e) => e && typeof e === 'object' && !Array.isArray(e) && e.props && e.props.key === undefined && path.endsWith('#map'))) throw new Error(`missing key at ${path}`);
      return element.flatMap((child, i) => render(child, `${path}.${i}`));
    }
    const { type, props } = element;
    if (typeof type === 'function') {
      const id = `${path}/${type.name}`;
      const frame = frames.get(id) ?? { hooks: [], mounted: false };
      frame.index = 0; current = frame;
      const output = type(props);
      if (frame.mounted && frame.index !== frame.hooks.length) throw new Error(`${type.name}: hook count changed between renders`);
      frame.mounted = true; frames.set(id, frame); current = null;
      return render(output, id);
    }
    const kids = props.children;
    const inner = Array.isArray(kids) ? kids.flatMap((c, i) => Array.isArray(c) ? render(c, `${path}.${String(type)}.${i}#map`) : render(c, `${path}.${String(type)}.${i}`)) : render(kids, `${path}.${String(type)}`);
    return [{ type, props, children: inner }];
  }
  const text = (nodes) => nodes.map((n) => typeof n === 'string' ? n : n.type === 'style' ? '' : text(n.children)).join(' ');
  const find = (nodes, predicate, out = []) => { for (const n of nodes) if (typeof n !== 'string') { if (predicate(n)) out.push(n); find(n.children, predicate, out); } return out; };
  return { React, render, text, find };
}

async function load(state) {
  const source = await readFile(new URL('../plugin/client.js', import.meta.url), 'utf8');
  const { React, render, text, find } = createReact();
  let definition; const slots = {};
  const response = () => Response.json(state);
  vm.runInNewContext(source, {
    window: { __ModuleLoader__: { load(d) { definition = d; } }, addEventListener() {}, removeEventListener() {} },
    document: { baseURI: 'http://dsh.internal/', visibilityState: 'visible', hasFocus: () => true, addEventListener() {}, removeEventListener() {} },
    fetch: async () => response(), navigator: {}, URL, AbortController, AbortSignal, Response, Date, Math, JSON,
    setTimeout: () => 0, clearTimeout() {},
  });
  const dict = {};
  const plugin = definition.factory(() => React);
  plugin.apply({
    effect(fn) { fn(); },
    locale: { register(ns, value) { Object.assign(dict, value.zh); return () => {}; }, bind: () => (key) => dict[key] ?? key },
    slots: { inject: (_n, fn) => fn(), register: (options, component) => { slots[options.name] = component; } },
  });
  await new Promise((r) => setTimeout(r, 20)); // first rpc('state') resolves
  return { slots, render, text, find, React };
}

const person = (id, name) => ({ id, name, code: id.padEnd(18, '0').toUpperCase().slice(0, 18) });
const base = { revision: 1, link: 'connected', error: '', hasIdentity: true, status: 'online', effectiveStatus: 'online', paused: false, serviceUrl: 'http://127.0.0.1:8787', incoming: [], outgoing: [], friends: [] };

test('welcome screen renders for a new user', async () => {
  const { slots, render, text, React } = await load({ ...base, hasIdentity: false, user: null, link: 'idle' });
  const out = text(render(React.createElement(slots.main)));
  assert.match(out, /和朋友一起在线/);
  assert.match(out, /创建身份/);
  assert.match(out, /127\.0\.0\.1:8787/);
});

test('full page renders groups, status messages, requests and last-seen without crashing', async () => {
  const now = Date.now();
  const state = {
    ...base,
    user: { ...person('me', '我自己'), message: '写代码' },
    friends: [
      { ...person('a1', 'Alice'), status: 'online', message: '在打游戏', lastSeen: null },
      { ...person('b2', 'Bob'), status: 'busy', message: '', lastSeen: null },
      { ...person('c3', 'Carol'), status: 'away', message: '', lastSeen: null },
      { ...person('d4', 'Dave'), status: 'offline', message: '', lastSeen: now - 3 * 3600_000 },
      { ...person('e5', '<img src=x onerror=alert(1)>'), status: 'offline', message: '', lastSeen: null },
    ],
    incoming: [{ id: 'r1', from: person('f6', 'Frank'), createdAt: now }],
    outgoing: [{ id: 'r2', to: person('g7', 'Grace'), createdAt: now }],
  };
  const { slots, render, text, find, React } = await load(state);
  const tree = render(React.createElement(slots.main));
  const out = text(tree);
  for (const expected of ['我自己', 'Alice', '在打游戏', 'Bob', '请勿打扰', 'Carol', '离开', 'Dave', '3 小时前', 'Frank', 'Grace', '等待对方确认', '好友 · 3/5', '在线 — 1', '离开 / 忙碌 — 2', '离线 — 2', 'ME0000']) {
    assert.ok(out.includes(expected), `missing: ${expected}`);
  }
  // Untrusted names are text children, never markup.
  assert.equal(find(tree, (n) => n.type === 'img').length, 0);
  assert.ok(out.includes('<img src=x onerror=alert(1)>'));
  // Rendering twice must keep hook order stable.
  render(React.createElement(slots.main));
});

test('paused, unauthorized and invisible states render their notices', async () => {
  for (const [patch, expected] of [
    [{ paused: true, link: 'paused', effectiveStatus: 'offline' }, '在线状态已暂停'],
    [{ link: 'unauthorized' }, '服务端不认识这个身份'],
    [{ status: 'invisible', effectiveStatus: 'invisible' }, '隐身时好友看到你离线'],
    [{ effectiveStatus: 'away' }, '离开（自动）'],
    [{ link: 'disconnected' }, '连接中断'],
  ]) {
    const { slots, render, text, React } = await load({ ...base, user: { ...person('me', 'Me'), message: '' }, ...patch });
    assert.ok(text(render(React.createElement(slots.main))).includes(expected), expected);
  }
});

test('sidebar entry shows the live unread/request count', async () => {
  const { slots, render, text, React } = await load({ ...base, user: person('me', 'Me'), incoming: Array.from({ length: 12 }, (_, i) => ({ id: `r${i}`, from: person(`p${i}`, `P${i}`), createdAt: 0 })) });
  assert.match(text(render(React.createElement(slots['sidebar.footer.action']))), /好友 12/);
});
