// Browser-only client. No DSH session access, external navigation, or demo data.
const TOKEN_KEY = 'dsh-friends.identity-token.v1';
const DEVICE_KEY = 'dsh-friends.tab-device.v1';
const PAUSED_KEY = 'dsh-friends.tab-paused.v1';
const STATUS_KEY = 'dsh-friends.tab-status.v1';
const HEARTBEAT_MS = 15_000;
const POLL_MS = 5_000;
const TTL_MS = 45_000;
const REQUEST_TIMEOUT_MS = 10_000;
const ACTIVE_STATUSES = new Set(['online', 'away', 'busy', 'invisible']);
const STATUS_LABELS = { online: '在线', away: '离开', busy: '忙碌', invisible: '隐身', offline: '离线' };
const $ = (id) => document.getElementById(id);
const collator = new Intl.Collator('zh-CN', { numeric: true, sensitivity: 'base' });
const state = {
  token: '', deviceId: '', user: null, desiredStatus: 'online', confirmedStatus: null, hasSavedStatus: false, paused: false,
  storageReady: false, phase: 'booting', authFailed: false,
  friends: [], incoming: [], outgoing: [], seeded: false,
  failedChecks: new Set(), lastHeartbeat: 0, lastHeartbeatAttempt: 0, lastPollAttempt: 0, lastSync: 0,
  pollTimer: 0, heartbeatTimer: 0, viewTimer: 0,
  friendsFlight: null, presenceFlight: null, releaseFlight: null, leaseQueue: Promise.resolve(),
  bootstrapFlight: null, presenceAgain: false, actionLocks: new Set(),
  tab: 'friends', confirmId: null, revision: 0, backgrounded: false,
};

class ApiError extends Error {
  constructor(status = 0, kind = 'network') {
    super(kind);
    this.status = status;
    this.kind = kind;
  }
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = String(text);
  return node;
}

function toast(message, error = false) {
  const node = element('div', `toast${error ? ' error' : ''}`, message);
  const region = $('toast-region');
  while (region.children.length >= 4) region.firstElementChild.remove();
  region.append(node);
  window.setTimeout(() => node.remove(), 6500);
}

function errorMessage(error, fallback = '操作未完成，请稍后重试。') {
  if (error.status === 401 || error.status === 403) return '身份验证失败。凭据仍保留在此浏览器，请检查服务后重连。';
  if (error.status === 404) return '目标不存在或已被处理，请刷新列表后重试。';
  if (error.status === 409) return '该操作与当前状态冲突，可能已是好友或已有待处理邀请。';
  if (error.status === 429) return '操作太频繁，请稍后再试。';
  if (error.status === 400 || error.status === 422) return '请检查昵称或好友码是否符合服务要求。';
  if (error.kind === 'timeout') return '连接超时，已保留当前好友列表，请稍后重试。';
  if (error.kind === 'invalid') return '服务返回了无法识别的数据，当前好友列表已保留。';
  if (!error.status || error.status >= 500) return '暂时无法连接服务，请检查网络后重试。';
  return fallback;
}

async function api(path, { method = 'GET', body, authenticated = true } = {}) {
  if (authenticated && !state.token) throw new ApiError(401, 'auth');
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (authenticated) {
    headers.Authorization = `Bearer ${state.token}`;
  }
  try {
    const response = await fetch(path, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal, credentials: 'same-origin', cache: 'no-store', redirect: 'error',
    });
    if (!response.ok) throw new ApiError(response.status, 'http');
    if (response.status === 204) return {};
    const content = await response.text();
    if (!content.trim()) return {};
    try { return JSON.parse(content); } catch { throw new ApiError(response.status, 'invalid'); }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(0, controller.signal.aborted ? 'timeout' : 'network');
  } finally {
    window.clearTimeout(timeout);
  }
}

function validId(value) {
  return (typeof value === 'string' && value.length > 0) || (typeof value === 'number' && Number.isFinite(value));
}

function parseUser(value) {
  if (!value || !validId(value.id) || typeof value.name !== 'string' || typeof value.code !== 'string') throw new ApiError(0, 'invalid');
  return { id: String(value.id), name: value.name, code: value.code };
}

function parseSnapshot(data) {
  if (!data || !Array.isArray(data.friends) || !Array.isArray(data.incoming) || !Array.isArray(data.outgoing)) throw new ApiError(0, 'invalid');
  const friends = data.friends.map((friend) => {
    const user = parseUser(friend);
    if (!ACTIVE_STATUSES.has(friend.status) && friend.status !== 'offline') throw new ApiError(0, 'invalid');
    return { ...user, status: friend.status, lastSeen: friend.lastSeen ?? null };
  });
  const parseRequest = (request, direction) => {
    if (!request || !validId(request.id)) throw new ApiError(0, 'invalid');
    return { id: String(request.id), [direction]: parseUser(request[direction]), createdAt: request.createdAt ?? null };
  };
  return { friends, incoming: data.incoming.map((r) => parseRequest(r, 'from')), outgoing: data.outgoing.map((r) => parseRequest(r, 'to')) };
}

function isPubliclyOnline(status) {
  return status === 'online' || status === 'away' || status === 'busy';
}

function displayedStatus(friend) {
  // Even if a server accidentally includes invisible, never expose it as online.
  return isPubliclyOnline(friend.status) ? friend.status : 'offline';
}

function canConnect() {
  return state.phase === 'ready' && Boolean(state.token) && !state.authFailed;
}

function canHeartbeat() {
  return canConnect() && !state.paused && document.visibilityState !== 'hidden';
}

function recordFailure(kind, error) {
  state.failedChecks.add(kind);
  if (error.status === 401 || error.status === 403) {
    state.authFailed = true;
    stopTimers();
  }
  renderConnection();
  renderIdentity();
}

function recordSuccess(kind) {
  state.failedChecks.delete(kind);
  renderConnection();
}

function setSession(key, value) {
  try { sessionStorage.setItem(key, value); } catch { /* Identity remains local; only this tab preference is unavailable. */ }
}

function randomDeviceId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function initStorage() {
  try {
    // Check storage before allowing explicit registration; never create a throwaway identity silently.
    const probe = `dsh-friends.storage-probe.${randomDeviceId()}`;
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    state.token = localStorage.getItem(TOKEN_KEY) || '';
    state.deviceId = sessionStorage.getItem(DEVICE_KEY) || randomDeviceId();
    sessionStorage.setItem(DEVICE_KEY, state.deviceId);
    state.paused = sessionStorage.getItem(PAUSED_KEY) === '1';
    const status = sessionStorage.getItem(STATUS_KEY);
    if (ACTIVE_STATUSES.has(status)) {
      state.desiredStatus = status;
      state.hasSavedStatus = true;
    }
    state.storageReady = true;
  } catch {
    state.phase = 'storage-error';
    $('welcome-view').hidden = false;
    $('register-button').disabled = true;
    setConnection('error', '浏览器存储不可用', '请允许此页面使用站点存储。嵌入页面可能被浏览器限制；不会创建无法保存的身份。');
  }
}

function setConnection(kind, title, detail, retry = false) {
  $('connection').dataset.state = kind;
  if ($('connection-title').textContent !== title) $('connection-title').textContent = title;
  if ($('connection-detail').textContent !== detail) $('connection-detail').textContent = detail;
  $('retry-button').hidden = !retry;
}

function renderConnection() {
  if (state.phase === 'storage-error') return;
  if (state.phase === 'changed') {
    setConnection('error', '浏览器身份已改变', '其他标签页更改或清除了身份。请重新加载本页；本页已停止续期，不会自动创建新身份。');
    return;
  }
  if (!state.token) {
    setConnection('paused', '尚未创建身份', '只有点击「创建我的身份」才会注册。无需 DSH 账号或密码。');
    return;
  }
  if (state.authFailed) {
    setConnection('error', '身份验证失败', '本地凭据未删除。请检查服务后重连；身份不可跨浏览器恢复。', true);
    return;
  }
  if (state.phase === 'booting') {
    setConnection('connecting', '正在连接好友服务', '正在恢复此浏览器保存的身份，不会创建新身份。');
    return;
  }
  if (state.phase === 'load-error') {
    setConnection('error', '连接失败 · 等待重连', '已保留身份，不会清空好友。自动重试中，也可以手动重连。', true);
    return;
  }
  if (state.failedChecks.size) {
    const age = state.lastHeartbeat ? Date.now() - state.lastHeartbeat : Infinity;
    const ttlText = age < TTL_MS ? `最近续期后约 ${Math.max(0, Math.ceil((TTL_MS - age) / 1000))} 秒到期。` : '此标签页可能已在他人列表中离线。';
    setConnection('error', '连接失败 · 正在重连', `保留最后成功的好友列表。${ttlText}恢复后自动同步。`, true);
    return;
  }
  if (state.paused) {
    setConnection('paused', '已暂停此标签页在线', '本地身份与好友仍保留，列表继续同步。其他标签页仍可能维持在线。');
    return;
  }
  if (document.visibilityState === 'hidden') {
    setConnection('background', '页面在后台 · 已停止续期', '后台不发送心跳；本标签页租约在最后一次续期 45 秒后过期，返回前台自动重连。');
    return;
  }
  if (!state.lastHeartbeat || Date.now() - state.lastHeartbeat >= TTL_MS) {
    setConnection('connecting', state.lastHeartbeat ? '租约已到期 · 正在重连' : '正在建立在线状态', '好友列表每 5 秒同步；前台每 15 秒续期，租约有效期 45 秒。');
    return;
  }
  setConnection('connected', state.seeded ? '已连接 · 自动同步中' : '已连接 · 正在获取好友', '好友列表每 5 秒同步；前台每 15 秒续期。断网或关闭后，租约最多约 45 秒到期。');
}

function renderIdentity() {
  if (!state.user) return;
  $('my-name').textContent = state.user.name;
  $('my-code').textContent = state.user.code;
  $('my-avatar').textContent = Array.from(state.user.name.trim())[0] || '我';
  $('status-select').value = state.desiredStatus;
  $('status-select').disabled = state.authFailed || state.phase !== 'ready';
  $('pause-button').disabled = state.authFailed || state.phase !== 'ready' || state.actionLocks.has('pause');
  $('pause-button').textContent = state.paused ? '恢复在线' : '暂停在线';
  const status = state.paused || state.authFailed ? 'offline' : state.desiredStatus;
  $('my-status-dot').className = `presence-dot ${status}`;
  let label = STATUS_LABELS[status];
  if (state.paused) label = '已暂停 · 身份保留';
  else if (state.authFailed || state.failedChecks.has('presence')) label = '连接中断 · 状态待确认';
  else if (document.visibilityState === 'hidden') label = '后台 · 暂停续期';
  else if (!state.lastHeartbeat || Date.now() - state.lastHeartbeat >= TTL_MS) label = '正在建立在线状态';
  else if (state.confirmedStatus !== state.desiredStatus) label = `正在设置为${STATUS_LABELS[status]}`;
  else if (status === 'invisible') label = '隐身 · 对朋友显示离线';
  $('my-status-text').textContent = label;
  $('presence-note').textContent = state.paused ? '恢复在线不会创建新身份。暂停仅清除此标签页租约，不注销令牌。' : '隐身仅隐藏此标签页；同一身份的其他在线标签页仍可能可见。';
}

function lastSeenText(value) {
  if (value === null || value === undefined || value === '') return '离线';
  const time = new Date(value).getTime();
  if (!Number.isFinite(time) || time > Date.now() + 60_000) return '离线';
  const elapsed = Math.max(0, Date.now() - time);
  if (elapsed < 60_000) return '离线 · 刚刚在线';
  if (elapsed < 3_600_000) return `离线 · ${Math.floor(elapsed / 60_000)} 分钟前在线`;
  if (elapsed < 86_400_000) return `离线 · ${Math.floor(elapsed / 3_600_000)} 小时前在线`;
  return `离线 · ${new Date(time).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}在线`;
}

function renderFriends() {
  const query = $('friend-search').value.trim().toLocaleLowerCase('zh-CN');
  const filtered = state.friends.filter((friend) => !query || friend.name.toLocaleLowerCase('zh-CN').includes(query) || friend.code.toLocaleLowerCase('zh-CN').includes(query));
  const online = state.friends.filter((friend) => isPubliclyOnline(friend.status)).length;
  $('friend-count').textContent = String(state.friends.length);
  $('online-count').textContent = state.seeded ? `${online} 在线 / ${state.friends.length} 好友` : '等待同步';
  const list = $('friends-list');
  const fragment = document.createDocumentFragment();
  const rank = { online: 0, away: 1, busy: 2, offline: 3 };
  filtered.sort((a, b) => rank[displayedStatus(a)] - rank[displayedStatus(b)] || collator.compare(a.name, b.name));
  let previousGroup = null;
  for (const friend of filtered) {
    const status = displayedStatus(friend);
    const group = isPubliclyOnline(status) ? 'online' : 'offline';
    if (group !== previousGroup) {
      fragment.append(element('div', 'group-label', group === 'online' ? '在线好友' : '离线好友'));
      previousGroup = group;
    }
    const row = element('div', `friend-row ${status}`);
    const avatarWrap = element('div', 'friend-avatar');
    const avatar = element('div', 'avatar', Array.from(friend.name.trim())[0] || '友');
    avatar.setAttribute('aria-hidden', 'true');
    const dot = element('span', `presence-dot ${status}`);
    dot.setAttribute('aria-hidden', 'true');
    avatarWrap.append(avatar, dot);
    const info = element('div', 'friend-info');
    info.append(element('span', 'friend-name', friend.name), element('span', `friend-state ${status}`, status === 'offline' ? lastSeenText(friend.lastSeen) : STATUS_LABELS[status]));
    const remove = element('button', 'remove-button', '×');
    remove.type = 'button';
    remove.title = '删除好友';
    remove.dataset.focusKey = `friend:${friend.id}:delete`;
    remove.setAttribute('aria-label', `删除好友 ${friend.name}`);
    remove.disabled = state.actionLocks.has(`friend:${friend.id}`) || state.authFailed;
    remove.addEventListener('click', () => openDeleteDialog(friend));
    row.append(avatarWrap, info, remove);
    fragment.append(row);
  }
  preserveFocusWhileReplacing(list, fragment);
  $('friends-empty').hidden = filtered.length > 0;
  const empty = $('friends-empty');
  if (!state.seeded) {
    empty.querySelector('h3').textContent = '等待好友列表';
    empty.querySelector('p').textContent = '正在连接真实服务，获取成功前不会显示虚构好友。';
    $('go-invite-button').hidden = true;
  } else if (query) {
    empty.querySelector('h3').textContent = '没有匹配的好友';
    empty.querySelector('p').textContent = '换个昵称或好友码试试。';
    $('go-invite-button').hidden = true;
  } else {
    empty.querySelector('h3').textContent = '还没有好友';
    empty.querySelector('p').textContent = '交换好友码，向朋友发出第一份邀请。';
    $('go-invite-button').hidden = false;
  }
}

function preserveFocusWhileReplacing(container, fragment) {
  // Snapshot polling must not steal keyboard focus from an existing action.
  const active = document.activeElement;
  const key = container.contains(active) ? active.dataset.focusKey : null;
  container.replaceChildren(fragment);
  if (key) {
    const replacement = Array.from(container.querySelectorAll('button')).find((button) => button.dataset.focusKey === key);
    if (replacement && !replacement.disabled) replacement.focus({ preventScroll: true });
  }
}

function renderRequests() {
  $('request-count').textContent = String(state.incoming.length);
  $('requests-tab').setAttribute('aria-label', `邀请，${state.incoming.length} 个收到的请求`);
  $('incoming-count').textContent = String(state.incoming.length);
  $('outgoing-count').textContent = String(state.outgoing.length);
  for (const direction of ['incoming', 'outgoing']) {
    const fragment = document.createDocumentFragment();
    for (const request of state[direction]) {
      const user = direction === 'incoming' ? request.from : request.to;
      const row = element('div', 'request-row');
      const avatar = element('div', 'avatar', Array.from(user.name.trim())[0] || '友');
      avatar.setAttribute('aria-hidden', 'true');
      const info = element('div', 'request-info');
      info.append(element('span', 'request-name', user.name), element('span', 'request-meta', `好友码 ${user.code}`));
      const actions = element('div', 'request-actions');
      const choices = direction === 'incoming' ? [['accept', '接受'], ['decline', '拒绝']] : [['cancel', '撤回']];
      for (const [action, label] of choices) {
        const button = element('button', `small-button${action === 'accept' ? '' : ' secondary'}`, label);
        button.type = 'button';
        button.dataset.focusKey = `${request.id}:${action}`;
        button.disabled = state.actionLocks.has(`request:${request.id}`) || state.authFailed;
        button.setAttribute('aria-label', `${label}${user.name}的好友邀请`);
        button.addEventListener('click', () => handleRequest(request.id, action));
        actions.append(button);
      }
      row.append(avatar, info, actions);
      fragment.append(row);
    }
    preserveFocusWhileReplacing($(`${direction}-list`), fragment);
    $(`${direction}-empty`).hidden = state[direction].length > 0;
  }
}

function renderLists() {
  renderFriends();
  renderRequests();
}

function applySnapshot(snapshot) {
  if (state.seeded) {
    const previous = new Map(state.friends.map((friend) => [friend.id, friend.status]));
    const cameOnline = snapshot.friends.filter((friend) => previous.has(friend.id) && !isPubliclyOnline(previous.get(friend.id)) && isPubliclyOnline(friend.status));
    if (cameOnline.length <= 3) {
      for (const friend of cameOnline) toast(`${friend.name} 上线了`);
    } else {
      toast(`${cameOnline[0].name} 等 ${cameOnline.length} 位好友上线了`);
    }
  }
  state.friends = snapshot.friends;
  state.incoming = snapshot.incoming;
  state.outgoing = snapshot.outgoing;
  state.seeded = true;
  state.lastSync = Date.now();
  renderLists();
}

async function refreshFriends() {
  if (!canConnect()) return;
  if (state.friendsFlight) return state.friendsFlight;
  const revision = state.revision;
  state.lastPollAttempt = Date.now();
  state.friendsFlight = (async () => {
    try {
      const data = await api('/api/friends');
      const snapshot = parseSnapshot(data);
      if (revision !== state.revision) return;
      applySnapshot(snapshot);
      recordSuccess('friends');
    } catch (error) {
      if (revision === state.revision) recordFailure('friends', error);
    } finally {
      state.friendsFlight = null;
    }
  })();
  return state.friendsFlight;
}

function schedulePoll() {
  window.clearTimeout(state.pollTimer);
  if (!canConnect() || document.visibilityState === 'hidden') return;
  state.pollTimer = window.setTimeout(async () => {
    await refreshFriends();
    if (canConnect() && state.paused && state.failedChecks.has('presence')) await releasePausedLease();
    schedulePoll();
  }, Math.max(250, POLL_MS - (Date.now() - state.lastPollAttempt)));
}

function enqueueLease(operation) {
  const next = state.leaseQueue.catch(() => {}).then(operation);
  state.leaseQueue = next;
  return next;
}

function scheduleHeartbeat() {
  window.clearTimeout(state.heartbeatTimer);
  if (!canHeartbeat()) return;
  state.heartbeatTimer = window.setTimeout(pulsePresence, Math.max(250, HEARTBEAT_MS - (Date.now() - state.lastHeartbeatAttempt)));
}

function pulsePresence() {
  window.clearTimeout(state.heartbeatTimer);
  if (!canHeartbeat()) return Promise.resolve();
  if (state.presenceFlight) {
    state.presenceAgain = true;
    return state.presenceFlight;
  }
  const revision = state.revision;
  state.presenceFlight = enqueueLease(async () => {
    if (!canHeartbeat() || revision !== state.revision) return;
    try {
      const sentStatus = state.desiredStatus;
      state.lastHeartbeatAttempt = Date.now();
      await api('/api/presence', { method: 'POST', body: { status: sentStatus, deviceId: state.deviceId } });
      if (revision !== state.revision) return;
      state.lastHeartbeat = Date.now();
      state.confirmedStatus = sentStatus;
      recordSuccess('presence');
    } catch (error) {
      if (revision === state.revision) recordFailure('presence', error);
    }
  }).finally(() => {
    state.presenceFlight = null;
    renderIdentity();
    if (state.presenceAgain && canHeartbeat()) {
      state.presenceAgain = false;
      void pulsePresence();
    } else {
      state.presenceAgain = false;
      scheduleHeartbeat();
    }
  });
  return state.presenceFlight;
}

function stopTimers() {
  window.clearTimeout(state.pollTimer);
  window.clearTimeout(state.heartbeatTimer);
}

async function bootstrap() {
  if (state.bootstrapFlight || !state.token || !state.storageReady || state.phase === 'changed') return;
  state.authFailed = false;
  state.phase = 'booting';
  renderConnection();
  const revision = state.revision;
  state.bootstrapFlight = (async () => {
    try {
      const data = await api('/api/me');
      const user = parseUser(data.user);
      if (revision !== state.revision) return;
      state.user = user;
      if (!state.hasSavedStatus && ACTIVE_STATUSES.has(data.status)) {
        state.desiredStatus = data.status;
        setSession(STATUS_KEY, data.status);
        state.hasSavedStatus = true;
      }
      state.phase = 'ready';
      state.failedChecks.delete('me');
      $('welcome-view').hidden = true;
      $('identity-view').hidden = false;
      $('workspace-view').hidden = false;
      $('rename-input').value = user.name;
      renderIdentity();
      renderLists();
      await Promise.all([refreshFriends(), pulsePresence()]);
      schedulePoll();
    } catch (error) {
      if (revision !== state.revision) return;
      state.phase = 'load-error';
      recordFailure('me', error);
      if (!state.authFailed && document.visibilityState !== 'hidden') {
        window.clearTimeout(state.pollTimer);
        state.pollTimer = window.setTimeout(bootstrap, POLL_MS);
      }
    } finally {
      state.bootstrapFlight = null;
      renderConnection();
    }
  })();
  return state.bootstrapFlight;
}

async function register(event) {
  event.preventDefault();
  if (state.token || !state.storageReady || state.phase === 'changed' || state.actionLocks.has('register')) return;
  const name = $('register-name').value.trim();
  if (!name) return $('register-name').focus();
  state.actionLocks.add('register');
  $('register-button').disabled = true;
  $('register-button').textContent = '正在创建…';
  const revision = state.revision;
  try {
    const result = await api('/api/register', { method: 'POST', authenticated: false, body: { name, signupCode: $('signup-code').value } });
    $('signup-code').value = '';
    const user = parseUser(result.user);
    if (typeof result.token !== 'string' || !result.token) throw new ApiError(0, 'invalid');
    if (revision !== state.revision) return;
    state.token = result.token;
    state.user = user;
    try {
      localStorage.setItem(TOKEN_KEY, state.token);
    } catch {
      // Never expose the token, even if browser storage becomes unavailable mid-request.
      toast('身份已创建，但浏览器拒绝保存。关闭或刷新本页会丢失身份；请先允许站点存储。', true);
      $('identity-reminder').textContent = '警告：身份尚未保存，刷新或关闭本页会丢失。请允许站点存储。';
    }
    state.paused = false;
    setSession(PAUSED_KEY, '0');
    state.phase = 'ready';
    $('welcome-view').hidden = true;
    $('identity-view').hidden = false;
    $('workspace-view').hidden = false;
    renderIdentity();
    renderLists();
    await Promise.all([refreshFriends(), pulsePresence()]);
    schedulePoll();
    toast('身份已创建。复制好友码，邀请你的朋友吧。');
  } catch (error) {
    toast(errorMessage(error, '创建未完成，请稍后重试。'), true);
  } finally {
    state.actionLocks.delete('register');
    $('register-button').disabled = Boolean(state.token) || !state.storageReady || state.phase === 'changed';
    $('register-button').textContent = '创建我的身份 →';
    renderConnection();
  }
}

async function mutate(key, operation, successMessage) {
  if (!canConnect() || state.actionLocks.has(key)) return false;
  state.actionLocks.add(key);
  renderLists();
  try {
    await operation();
    if (successMessage) toast(successMessage);
    // A poll already in flight may predate the mutation; fetch a fresh snapshot after it.
    if (state.friendsFlight) await state.friendsFlight;
    await refreshFriends();
    return true;
  } catch (error) {
    toast(errorMessage(error), true);
    if (error.status === 401 || error.status === 403) recordFailure('friends', error);
    if (error.status === 404 || error.status === 409) await refreshFriends();
    return false;
  } finally {
    state.actionLocks.delete(key);
    renderLists();
  }
}

async function handleRequest(id, action) {
  const messages = { accept: '已接受好友邀请。', decline: '已拒绝好友邀请。', cancel: '已撤回好友邀请。' };
  await mutate(`request:${id}`, () => api(`/api/requests/${encodeURIComponent(id)}`, { method: 'POST', body: { action } }), messages[action]);
}

function openDeleteDialog(friend) {
  if (!canConnect()) return;
  state.confirmId = friend.id;
  $('confirm-description').textContent = `确定删除「${friend.name}」吗？删除后将不再互相分享在线状态，重新添加仍需双方同意。`;
  $('confirm-delete').disabled = false;
  $('confirm-dialog').showModal();
}

async function deleteConfirmed(event) {
  event.preventDefault();
  const action = event.submitter?.value;
  const dialog = $('confirm-dialog');
  if (action !== 'delete') {
    state.confirmId = null;
    dialog.close();
    return;
  }
  const id = state.confirmId;
  if (!id) return;
  $('confirm-delete').disabled = true;
  const success = await mutate(`friend:${id}`, () => api(`/api/friends/${encodeURIComponent(id)}`, { method: 'DELETE' }), '已删除好友。');
  $('confirm-delete').disabled = false;
  if (success) {
    state.confirmId = null;
    dialog.close();
    $('friends-tab').focus();
  }
}

async function releasePausedLease() {
  if (state.releaseFlight) return state.releaseFlight;
  const revision = state.revision;
  state.releaseFlight = enqueueLease(async () => {
    if (!canConnect() || !state.paused || revision !== state.revision) return false;
    try {
      await api('/api/logout', { method: 'POST', body: { deviceId: state.deviceId } });
      if (revision !== state.revision) return false;
      state.lastHeartbeat = 0;
      state.confirmedStatus = null;
      recordSuccess('presence');
      return true;
    } catch (error) {
      if (revision === state.revision) recordFailure('presence', error);
      return false;
    }
  }).finally(() => { state.releaseFlight = null; });
  return state.releaseFlight;
}

async function togglePause() {
  if (!canConnect() || state.actionLocks.has('pause')) return;
  state.actionLocks.add('pause');
  try {
    state.paused = !state.paused;
    setSession(PAUSED_KEY, state.paused ? '1' : '0');
    renderIdentity();
    renderConnection();
    if (state.paused) {
      window.clearTimeout(state.heartbeatTimer);
      state.presenceAgain = false;
      // Serialize after any in-flight heartbeat, so logout cannot be undone by it.
      if (await releasePausedLease()) {
        toast('已暂停此标签页在线。身份仍保留，可随时恢复。');
      } else {
        toast('已停止心跳，租约清除失败。会自动重试，最后续期最多 45 秒后到期；身份仍保留。', true);
      }
    } else {
      await pulsePresence();
      if (!state.failedChecks.has('presence')) toast('已恢复此标签页在线。');
    }
  } catch (error) {
    recordFailure('presence', error);
    toast(state.paused ? '已停止发送心跳，但未能清除租约。最后续期最多 45 秒后到期，身份仍保留。' : errorMessage(error), true);
  } finally {
    state.actionLocks.delete('pause');
    renderIdentity();
    renderConnection();
  }
}

function switchTab(tab, focus = false) {
  state.tab = tab;
  for (const name of ['friends', 'requests']) {
    const selected = name === tab;
    $(`${name}-tab`).setAttribute('aria-selected', String(selected));
    $(`${name}-tab`).tabIndex = selected ? 0 : -1;
    $(`${name}-content`).hidden = !selected;
  }
  if (focus) $(`${tab}-tab`).focus();
}

async function copyCode() {
  if (!state.user) return;
  const code = state.user.code;
  try {
    if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable');
    await navigator.clipboard.writeText(code);
    toast('好友码已复制。只与想添加的朋友分享。');
  } catch {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents($('my-code'));
    selection?.removeAllRanges();
    selection?.addRange(range);
    toast('浏览器不允许自动复制。已选中好友码，请手动复制。');
  }
}

async function retry() {
  $('retry-button').disabled = true;
  try {
    if (state.phase !== 'ready' || state.authFailed) await bootstrap();
    else {
      await Promise.all([refreshFriends(), state.paused && state.failedChecks.has('presence')
        ? releasePausedLease() : pulsePresence()]);
      schedulePoll();
    }
  } finally { $('retry-button').disabled = false; }
}

$('register-form').addEventListener('submit', register);
$('retry-button').addEventListener('click', retry);
$('copy-code-button').addEventListener('click', copyCode);
$('pause-button').addEventListener('click', togglePause);
$('status-select').addEventListener('change', () => {
  const value = $('status-select').value;
  if (!ACTIVE_STATUSES.has(value)) return;
  state.desiredStatus = value;
  state.hasSavedStatus = true;
  setSession(STATUS_KEY, value);
  renderIdentity();
  if (state.paused) toast('状态已保存，恢复在线后生效。');
  else void pulsePresence();
});
$('edit-name-button').addEventListener('click', () => {
  if (!state.user) return;
  $('rename-form').hidden = false;
  $('rename-input').value = state.user.name;
  $('rename-input').focus();
  $('rename-input').select();
});
$('rename-cancel').addEventListener('click', () => {
  $('rename-form').hidden = true;
  $('edit-name-button').focus();
});
$('rename-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = $('rename-input').value.trim();
  if (!name || !canConnect() || state.actionLocks.has('rename')) return;
  state.actionLocks.add('rename');
  $('rename-save').disabled = true;
  try {
    const result = await api('/api/me', { method: 'PATCH', body: { name } });
    state.user = parseUser(result.user);
    renderIdentity();
    $('rename-form').hidden = true;
    $('edit-name-button').focus();
    toast('昵称已更新。');
  } catch (error) {
    toast(errorMessage(error), true);
    if (error.status === 401 || error.status === 403) recordFailure('me', error);
  } finally {
    state.actionLocks.delete('rename');
    $('rename-save').disabled = false;
  }
});
$('friend-search').addEventListener('input', renderFriends);
$('friends-tab').addEventListener('click', () => switchTab('friends'));
$('requests-tab').addEventListener('click', () => switchTab('requests'));
for (const id of ['friends-tab', 'requests-tab']) {
  $(id).addEventListener('keydown', (event) => {
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      switchTab(event.key === 'Home' ? 'friends' : event.key === 'End' ? 'requests' : state.tab === 'friends' ? 'requests' : 'friends', true);
    }
  });
}
$('go-invite-button').addEventListener('click', () => {
  switchTab('requests');
  $('friend-code-input').focus();
});
$('add-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const code = $('friend-code-input').value.trim();
  if (!code || !canConnect() || state.actionLocks.has('add')) return;
  if (code === state.user?.code) return toast('这是你自己的好友码，请输入朋友的好友码。', true);
  $('add-button').disabled = true;
  try {
    const success = await mutate('add', () => api('/api/requests', { method: 'POST', body: { code } }), '邀请已发送，等待对方同意。');
    if (success) $('friend-code-input').value = '';
  } finally { $('add-button').disabled = false; }
});
$('confirm-form').addEventListener('submit', deleteConfirmed);
$('confirm-dialog').addEventListener('cancel', () => { state.confirmId = null; });
document.addEventListener('visibilitychange', () => {
  stopTimers();
  renderConnection();
  renderIdentity();
  if (document.visibilityState === 'hidden') return;
  if (state.phase === 'load-error') void bootstrap();
  else if (canConnect()) {
    void refreshFriends().finally(schedulePoll);
    void pulsePresence();
  }
});
window.addEventListener('online', () => { if (state.token) void retry(); });
window.addEventListener('offline', () => {
  if (state.token && state.phase === 'ready') {
    state.failedChecks.add('friends');
    if (!state.paused) state.failedChecks.add('presence');
    renderConnection();
    renderIdentity();
  }
});
window.addEventListener('pagehide', () => {
  // No unload logout: a late request could remove the refreshed tab's new lease.
  // Closing is handled by the server's 45-second TTL. Explicit pause calls logout.
  state.backgrounded = true;
  stopTimers();
});
window.addEventListener('pageshow', (event) => {
  if (event.persisted && state.backgrounded) {
    state.backgrounded = false;
    if (canConnect()) {
      void refreshFriends().finally(schedulePoll);
      void pulsePresence();
    }
  }
});
window.addEventListener('storage', (event) => {
  if (event.key !== TOKEN_KEY && event.key !== null) return;
  let current;
  try { current = localStorage.getItem(TOKEN_KEY) || ''; } catch { current = ''; }
  if (current !== state.token) {
    state.revision += 1;
    state.phase = 'changed';
    state.authFailed = true;
    stopTimers();
    $('register-button').disabled = true;
    $('status-select').disabled = true;
    $('pause-button').disabled = true;
    renderConnection();
    toast('浏览器身份已更改。本页已停止续期，请重新加载。', true);
  }
});

initStorage();
if (state.storageReady) {
  if (state.token) void bootstrap();
  else {
    state.phase = 'welcome';
    $('welcome-view').hidden = false;
    renderConnection();
  }
}
state.viewTimer = window.setInterval(() => {
  if (state.phase === 'ready' && document.visibilityState !== 'hidden') {
    renderConnection();
    renderIdentity();
  }
}, 1000);
