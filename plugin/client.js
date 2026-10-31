window.__ModuleLoader__.load({
  id: 'dsh-friends-plugin',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const NS = 'dsh-friends-plugin';
    const PANEL = 'dsh-friends';
    const STATUSES = ['online', 'away', 'busy', 'invisible'];
    const zh = {
      title: '好友', privacy: '分享昵称、状态和一对一文字消息；不读取 DSH 会话、文件或任务。',
      openFriends: '打开好友浮窗', chat: '聊天', chats: '聊天', minimize: '最小化', restore: '还原', close: '关闭', resize: '调整窗口大小',
      chatPlaceholder: '输入消息…', sendMessage: '发送', retry: '重试发送', history: '加载更早消息',
      noMessages: '还没有消息，打个招呼吧。离线好友也可以收到消息。', loading: '正在加载…', messageLimit: '消息最多 2000 个字符',
      messageFailed: '发送失败，草稿已保留。点击重试不会重复发送。', read: '已读', unread: '未读消息', manageHint: '在左侧“好友”管理页创建身份、添加好友和管理设置。',
      offlineChat: '好友离线，消息将在对方上线后送达', newMessage: '发来消息',
      welcome: '和朋友一起在线', welcomeSub: '创建一个昵称，交换好友码，双方同意后就能看到彼此在线。',
      nickname: '昵称', create: '创建身份', signup: '注册邀请码（服务端要求时填写）',
      identityNote: '身份保存在这台电脑的 DSH 凭据库中，重启 DSH、刷新页面都不会丢失；换电脑需要重新创建。',
      online: '在线', away: '离开', busy: '请勿打扰', invisible: '隐身', offline: '离线', paused: '已暂停',
      autoAway: '离开（自动）', groupOnline: '在线', groupAway: '离开 / 忙碌', groupOffline: '离线',
      link_connecting: '正在连接…', link_connected: '', link_disconnected: '连接中断，正在重试；保留上次列表',
      link_paused: '在线状态已暂停，好友看到你离线', link_unauthorized: '服务端不认识这个身份。可能连接了另一台服务器，或服务器数据已重置。', link_idle: '',
      message: '状态留言', messagePlaceholder: '正在做什么？（60 字以内，仅在线时显示）', save: '保存',
      code: '我的好友码', copy: '复制', copied: '好友码已复制', copyFail: '复制失败，请手动选择',
      avatar: '头像', changeAvatar: '更换头像', removeAvatar: '移除头像', avatarType: '只支持 PNG / JPEG / WebP 图片', avatarTooBig: '压缩后仍然太大，换一张小点的图',
      signature: '签名', signaturePlaceholder: '写点什么（140 字以内）', words: '状态词条', wordsHint: '留空用默认词，例如把「在线」显示成「写代码中」',
      wordOnline: '在线显示为', wordAway: '离开显示为', wordBusy: '忙碌显示为', saveProfile: '保存资料', saved: '已保存',
      transfer: '换电脑', transferHint: '在旧电脑生成迁移码，在这台电脑输入即可接手同一身份与好友；旧电脑会立刻退出。',
      transferMint: '生成迁移码', transferShare: '多端共享码', transferClaim: '用迁移码接手', transferCode: '迁移码', transferExpires: '10 分钟内有效，只能用一次',
      transferMoveHint: '接手后旧电脑会退出登录', transferShareHint: '两台同时在线，旧电脑继续可用；两台权限完全相同',
      transferDone: '已接手身份', transferBadCode: '迁移码是 8 位字母数字',
      wordActive: '使用中显示为', wordIdle: '空闲显示为', wordRunning: '跑任务显示为', using: '使用中', idle: '空闲', running: '在跑任务',
      taskElapsed: '本轮', today: '今日', tokens: 'tokens', calls: '次调用', taskHint: '检测到 DSH 正在写会话日志时自动显示',
      add: '添加好友', friendCode: '粘贴朋友的好友码', send: '发送申请', sent: '好友申请已发送',
      search: '搜索好友', requests: '好友申请', accept: '接受', decline: '拒绝', cancel: '撤回', waiting: '等待对方确认',
      empty: '还没有好友。把好友码发给朋友，或粘贴对方的好友码。', noMatch: '没有匹配的好友',
      remove: '删除好友', confirmRemove: '删除好友并清除双方聊天记录，无法恢复。', confirm: '确定', back: '取消',
      chatPrivacy: '消息保存于好友服务，非端到端加密；每段会话保留最近 1000 条。',
      pause: '暂停在线', resume: '恢复在线', rename: '修改昵称', profile: '资料与好友码',
      settings: '身份与隐私', forget: '在本机忘记身份', confirmForget: '只删除本机凭据；服务器上的账号与好友关系保留，但之后无法再登录这个身份。',
      deleteAccount: '注销账号', confirmDelete: '永久删除服务器上的账号、好友关系和申请，无法恢复。',
      service: '好友服务', joined: '上线了', newRequest: '向你发送了好友申请',
      lastSeen: '最后在线', justNow: '刚刚', minutes: '分钟前', hours: '小时前', days: '天前',
      invisibleNote: '隐身时好友看到你离线，你仍能看到他们。', autoAwayNote: '一段时间未使用 DSH 会自动显示为离开。',
      error_unreachable: '无法连接好友服务，请检查插件 serviceUrl 和服务端是否运行', error_host: '无法连接 DSH，请确认 DSH 仍在运行', error_inactive: '好友插件的后台部分没有启用，请在插件页检查它是否报错', 'error_bad-upstream': '好友服务返回了无法识别的内容',
      'error_invalid-code': '好友码格式不对，应为 18 位字母数字', 'error_no-identity': '请先创建身份', 'error_identity-exists': '已有身份',
      error_internal: '插件内部错误', error_invalid: '输入无效', error_generic: '操作失败',
    };
    const en = {
      title: 'Friends', privacy: 'Share your nickname, presence and direct text messages. DSH conversations, files and tasks are never read.',
      openFriends: 'Open floating friends', chat: 'Chat', chats: 'Chats', minimize: 'Minimize', restore: 'Restore', close: 'Close', resize: 'Resize window',
      chatPlaceholder: 'Write a message…', sendMessage: 'Send', retry: 'Retry send', history: 'Load older messages',
      noMessages: 'No messages yet. Say hello — offline friends can receive messages too.', loading: 'Loading…', messageLimit: 'Messages can contain up to 2000 characters',
      messageFailed: 'Send failed. Your draft is kept; retrying will not send duplicates.', read: 'Read', unread: 'Unread messages', manageHint: 'Use Friends in the sidebar to create your identity, add friends and manage settings.',
      offlineChat: 'Your friend is offline. They will receive your message when they return.', newMessage: 'sent a message',
      welcome: 'Be online together', welcomeSub: 'Pick a nickname, swap friend codes, and see each other online once both accept.',
      nickname: 'Nickname', create: 'Create identity', signup: 'Signup code (if the server requires one)',
      identityNote: 'Your identity is kept in this computer’s DSH credential store and survives restarts and reloads. Another computer needs a new identity.',
      online: 'Online', away: 'Away', busy: 'Do not disturb', invisible: 'Invisible', offline: 'Offline', paused: 'Paused',
      autoAway: 'Away (auto)', groupOnline: 'Online', groupAway: 'Away / Busy', groupOffline: 'Offline',
      link_connecting: 'Connecting…', link_connected: '', link_disconnected: 'Connection lost, retrying; showing last known list',
      link_paused: 'Presence paused; friends see you offline', link_unauthorized: 'The server does not recognise this identity. You may be connected to a different server, or its data was reset.', link_idle: '',
      message: 'Status message', messagePlaceholder: 'What are you up to? (60 chars, shown only while online)', save: 'Save',
      code: 'My friend code', copy: 'Copy', copied: 'Friend code copied', copyFail: 'Copy failed; select it manually',
      avatar: 'Avatar', changeAvatar: 'Change avatar', removeAvatar: 'Remove avatar', avatarType: 'PNG / JPEG / WebP only', avatarTooBig: 'Still too large after compression; pick a smaller image',
      signature: 'Signature', signaturePlaceholder: 'Say something (up to 140 characters)', words: 'Status words', wordsHint: 'Leave empty for the default wording, e.g. show “Coding” for Online',
      wordOnline: 'Online shows as', wordAway: 'Away shows as', wordBusy: 'Busy shows as', saveProfile: 'Save profile', saved: 'Saved', restartHint: 'Plugin updated — restart DSH to activate the new behaviour',
      wordActive: 'Using shows as', wordIdle: 'Idle shows as', wordRunning: 'Task shows as', using: 'Using DSH', idle: 'Idle', running: 'Running a task',
      taskElapsed: 'This round', today: 'Today', tokens: 'tokens', calls: 'calls', taskHint: 'Shown automatically while DSH is writing the session log',
      add: 'Add a friend', friendCode: 'Paste a friend code', send: 'Send request', sent: 'Friend request sent',
      search: 'Search friends', requests: 'Friend requests', accept: 'Accept', decline: 'Decline', cancel: 'Cancel', waiting: 'Waiting for them',
      empty: 'No friends yet. Share your code or paste theirs.', noMatch: 'No matching friends',
      remove: 'Remove friend', confirmRemove: 'Remove this friend and permanently clear the chat history for both of you?', confirm: 'Confirm', back: 'Cancel',
      chatHint: 'Enter 发送 · Shift+Enter 换行', chatPrivacy: 'Messages are stored by the friends service, not end-to-end encrypted. Each conversation keeps its latest 1000 messages.',
      pause: 'Pause presence', resume: 'Resume presence', rename: 'Rename', profile: 'Profile & friend code',
      settings: 'Identity & privacy', forget: 'Forget identity on this computer', confirmForget: 'Deletes only the local credential. The server account and friendships remain, but you can never sign in as it again.',
      deleteAccount: 'Delete account', confirmDelete: 'Permanently deletes the server account, friendships and requests.',
      service: 'Friends service', joined: 'is now online', newRequest: 'sent you a friend request',
      lastSeen: 'Last online', justNow: 'just now', minutes: 'min ago', hours: 'h ago', days: 'd ago',
      invisibleNote: 'While invisible, friends see you offline; you still see them.', autoAwayNote: 'You show as away after a while without using DSH.',
      error_unreachable: 'Cannot reach the friends service. Check serviceUrl and that the server is running.', error_host: 'Cannot reach DSH. Make sure it is still running.', error_inactive: 'The friends plugin backend is not active. Check the Plugins page for errors.', 'error_bad-upstream': 'The friends service returned an unexpected response',
      'error_invalid-code': 'Friend codes are 18 letters and digits', 'error_no-identity': 'Create an identity first', 'error_identity-exists': 'An identity already exists',
      error_internal: 'Plugin error', error_invalid: 'Invalid input', error_generic: 'Something went wrong',
    };
    const css = `
.dsf{--dsf-line:var(--dsw-alias-border-l3);--dsf-hover:var(--dsw-alias-interactive-bg-hover);--dsf-ink:var(--dsw-alias-label-primary);--dsf-ink-2:var(--dsw-alias-label-secondary);--dsf-ink-3:var(--dsw-alias-label-tertiary);--dsf-card:var(--dsw-alias-bg-layer-2);--dsf-sunken:var(--dsw-alias-bg-layer-3);--dsf-green:var(--dsw-alias-state-success-primary);--dsf-amber:var(--dsw-alias-state-warn-primary);--dsf-red:var(--dsw-alias-state-error-primary);--dsf-blue:var(--dsw-alias-state-business-primary);color:var(--dsf-ink);height:100%;overflow:auto;box-sizing:border-box;padding:32px clamp(16px,4vw,40px) 56px;font-size:13px;-webkit-font-smoothing:antialiased}
.dsf *{box-sizing:border-box}.dsf-wrap{max-width:680px;margin:0 auto;display:flex;flex-direction:column;gap:16px}
.dsf h1{margin:0;font-size:19px;font-weight:600;letter-spacing:-.01em}.dsf h2{margin:0;font-size:12px;font-weight:600;color:var(--dsf-ink-3);letter-spacing:.04em;text-transform:uppercase}
.dsf p{margin:0;line-height:1.55}.dsf-muted{color:var(--dsf-ink-2);font-size:12.5px}.dsf-faint{color:var(--dsf-ink-3);font-size:11.5px}
.dsf-row{display:flex;align-items:center;gap:8px;min-width:0;flex-wrap:wrap}.dsf-grow{flex:1;min-width:0}
.dsf input,.dsf select{font:inherit;font-size:12.5px;color:var(--dsf-ink);background:var(--dsf-sunken);border:1px solid transparent;border-radius:9px;height:32px;padding:0 10px;min-width:0;outline:none;transition:border-color .12s,background .12s}
.dsf input::placeholder{color:var(--dsf-ink-3)}
.dsf input:hover,.dsf select:hover{border-color:var(--dsf-line)}
.dsf input:focus,.dsf select:focus{border-color:var(--dsf-blue);background:var(--dsf-card)}
.dsf input{flex:1}
.dsf-btn{font:inherit;font-size:12.5px;height:30px;padding:0 11px;border-radius:9px;border:1px solid transparent;background:var(--dsf-sunken);color:var(--dsf-ink);cursor:pointer;white-space:nowrap;display:inline-flex;align-items:center;justify-content:center;gap:5px;transition:background .12s,opacity .12s}
.dsf-btn:hover:not(:disabled){background:var(--dsf-hover)}
.dsf-btn:disabled{opacity:.45;cursor:default}
.dsf-btn.primary{background:var(--dsf-blue);color:var(--dsw-alias-label-primary-foreground,#fff)}
.dsf-btn.primary:hover:not(:disabled){filter:brightness(1.08)}
.dsf-btn.ghost{background:transparent;color:var(--dsf-ink-2)}
.dsf-btn.danger{background:transparent;color:var(--dsf-red)}
.dsf-btn.danger:hover:not(:disabled){background:color-mix(in srgb,var(--dsf-red) 14%,transparent)}
.dsf-icon-btn{all:unset;cursor:pointer;width:26px;height:26px;display:inline-grid;place-items:center;border-radius:7px;color:var(--dsf-ink-3);flex:none}
.dsf-icon-btn:hover{background:var(--dsf-hover);color:var(--dsf-ink)}
.dsf-icon-btn:disabled{opacity:.4;cursor:default}
.dsf :focus-visible{outline:2px solid var(--dsf-blue);outline-offset:1px}
.dsf-panel{border:1px solid var(--dsf-line);border-radius:14px;background:var(--dsf-card);padding:14px;display:flex;flex-direction:column;gap:10px}
.dsf-avatar{position:relative;flex:none;width:40px;height:40px;border-radius:11px;display:grid;place-items:center;font-size:16px;font-weight:600;background:var(--dsf-sunken);color:var(--dsf-ink-2);letter-spacing:0;overflow:hidden}
.dsf-avatar.small{width:30px;height:30px;border-radius:9px;font-size:12.5px}.dsf-avatar-img{width:100%;height:100%;object-fit:cover;display:block}
.dsf-avatar[data-status=online],.dsf-avatar[data-status=away],.dsf-avatar[data-status=busy]{color:var(--dsf-ink)}
.dsf-dot{position:absolute;right:-2px;bottom:-2px;width:11px;height:11px;border-radius:50%;border:2.5px solid var(--dsf-card);background:var(--dsf-ink-3);box-sizing:content-box}
.dsf-dot[data-status=online]{background:var(--dsf-green)}.dsf-dot[data-status=away]{background:var(--dsf-amber)}.dsf-dot[data-status=busy]{background:var(--dsf-red)}
.dsf-name{font-weight:600;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:flex;align-items:center;gap:6px}
.dsf-sub{font-size:11.5px;color:var(--dsf-ink-3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;line-height:1.5}
.dsf-sub[data-status=online]{color:var(--dsf-green)}.dsf-sub[data-status=away]{color:var(--dsf-amber)}.dsf-sub[data-status=busy]{color:var(--dsf-red)}
.dsf-code{font-family:var(--ds-font-family-code,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:11.5px;letter-spacing:.06em;color:var(--dsf-ink-2);user-select:all;overflow-wrap:anywhere}
.dsf-self{display:flex;align-items:center;gap:10px;padding:2px 0 6px}
.dsf-self .dsf-name{font-size:13.5px}
.dsf-group{display:flex;flex-direction:column;gap:1px;padding-top:2px}
.dsf-group-head{all:unset;cursor:pointer;display:flex;align-items:center;gap:6px;padding:10px 8px 5px;font-size:11px;font-weight:600;letter-spacing:.05em;color:var(--dsf-ink-3);text-transform:uppercase;position:sticky;top:0;background:var(--dsf-card);z-index:1}
.dsf-group-head:hover{color:var(--dsf-ink-2)}
.dsf-chev{width:10px;display:inline-block;text-align:center;font-size:9px;transition:transform .15s;opacity:.75}
.dsf-group-head[aria-expanded=false] .dsf-chev{transform:rotate(-90deg)}
.dsf-friend{display:flex;align-items:center;gap:10px;padding:6px 8px;border-radius:10px;min-height:42px;position:relative}
.dsf-friend:hover{background:var(--dsf-hover)}
.dsf-friend[data-status=offline] .dsf-name{color:var(--dsf-ink-2);font-weight:500}
.dsf-friend .dsf-actions{display:flex;align-items:center;gap:2px;opacity:0;transition:opacity .12s;flex:none}
.dsf-friend:hover .dsf-actions,.dsf-friend:focus-within .dsf-actions,.dsf-friend[data-confirm] .dsf-actions{opacity:1}
.dsf-friend .dsf-unread{margin-left:auto}
.dsf-usage{display:flex;align-items:center;gap:5px;font-size:10.5px;color:var(--dsf-ink-3);padding:0 2px 4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dsf-word{font-size:10px;font-weight:500;color:var(--dsf-ink-2);background:var(--dsf-sunken);border-radius:99px;padding:1px 7px;white-space:nowrap;flex:none}
.dsf-unread{display:inline-flex;align-items:center;justify-content:center;min-width:17px;height:17px;padding:0 5px;border-radius:99px;background:var(--dsf-red);color:#fff;font-size:10.5px;font-weight:600;line-height:1;flex:none}
.dsf-alert{font-size:11.5px;line-height:1.55;padding:8px 10px;border-radius:9px;background:color-mix(in srgb,var(--dsf-amber) 14%,transparent);color:var(--dsf-ink);overflow-wrap:anywhere}
.dsf-alert.error{background:color-mix(in srgb,var(--dsf-red) 14%,transparent)}
.dsf details>summary{cursor:pointer;font-size:12px;color:var(--dsf-ink-2);list-style:none}
.dsf details>summary::-webkit-details-marker{display:none}
.dsf details[open]>summary{margin-bottom:8px}
.dsf-toasts{position:fixed;right:20px;bottom:20px;z-index:1000;display:flex;flex-direction:column;gap:8px;pointer-events:none;max-width:min(330px,calc(100vw - 40px))}
.dsf-toast{display:flex;gap:9px;align-items:center;padding:9px 12px;border-radius:12px;background:var(--dsf-card);border:1px solid var(--dsf-line);box-shadow:0 8px 26px #0000002e;color:var(--dsf-ink);font-size:12.5px;overflow-wrap:anywhere;animation:dsf-in .18s ease-out;pointer-events:auto}
@keyframes dsf-in{from{opacity:0;transform:translateY(6px)}}
@media (prefers-reduced-motion:reduce){.dsf-toast{animation:none}.dsf-chev{transition:none}}
.dsf-overlay{position:fixed;inset:0;pointer-events:none;z-index:1000}.dsf-overlay>*{pointer-events:auto}
.dsf.dsf-float{position:absolute;padding:0;overflow:hidden;display:flex;flex-direction:column;border:1px solid var(--dsf-line);border-radius:14px;background:var(--dsf-card);box-shadow:0 18px 50px #00000047,0 2px 8px #00000026;max-width:100vw;max-height:100dvh;font-size:13px;color:var(--dsf-ink)}
.dsf.dsf-float:focus-within{border-color:color-mix(in srgb,var(--dsf-line) 60%,var(--dsf-blue))}
.dsf-titlebar{display:flex;align-items:center;gap:6px;flex:none;height:40px;padding:0 6px 0 12px;border-bottom:1px solid var(--dsf-line);cursor:move;touch-action:none;user-select:none;background:var(--dsf-card)}
.dsf-titlebar .dsf-title-icon{width:16px;height:16px;color:var(--dsf-ink-2);flex:none;display:grid;place-items:center}
.dsf-titlebar strong{font-size:12.5px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsf-titlebar .dsf-title-note{font-size:11px;color:var(--dsf-ink-3);margin-left:2px;overflow:hidden;white-space:nowrap}
.dsf-titlebar .dsf-window-actions{margin-left:auto;display:flex;align-items:center;gap:1px}
.dsf-float-body{flex:1;min-height:0;overflow:auto;padding:10px 10px 12px;display:flex;flex-direction:column;gap:6px;scrollbar-width:thin}
.dsf-float-body .dsf-panel{border:0;background:transparent;padding:0;gap:8px}
.dsf-float-body>*{flex:none}
.dsf-float-body .dsf-selfdetails[open]{flex:none}
.dsf-float-body .dsf-panel>h2{padding:2px 2px 0}.dsf-float-body .dsf-hide-float{display:none}
.dsf-float-body.chat{padding:0;gap:0;overflow:hidden}
.dsf-float-body::-webkit-scrollbar{width:9px}.dsf-float-body::-webkit-scrollbar-thumb{background:color-mix(in srgb,var(--dsf-ink-3) 35%,transparent);border-radius:9px;border:2px solid var(--dsf-card)}
.dsf-resize{position:absolute;right:1px;bottom:1px;width:18px;height:18px;background:transparent;border:0;color:color-mix(in srgb,var(--dsf-ink-3) 70%,transparent);cursor:nwse-resize;touch-action:none;z-index:2;font-size:10px;line-height:1;padding:0;display:grid;place-items:center}
.dsf-launcher{position:absolute;right:20px;bottom:20px;display:flex;align-items:center;gap:7px;height:38px;padding:0 13px;border-radius:19px;border:1px solid var(--dsf-line);background:var(--dsf-card);color:var(--dsf-ink);box-shadow:0 6px 20px #0000002a;cursor:pointer;font:inherit;font-size:12.5px;font-weight:500;z-index:10001;transition:transform .12s,box-shadow .12s}
.dsf-launcher:hover{transform:translateY(-1px);box-shadow:0 9px 26px #00000035}
.dsf-launcher .dsf-unread{position:absolute;top:-4px;right:-4px;border:2px solid var(--dsf-card);box-sizing:content-box}
.dsf-overlay>.dsf-toasts{bottom:70px;pointer-events:none;z-index:10002}
.dsf-toast button{all:unset;cursor:pointer;flex:1;min-width:0;font:inherit}
.dsf-tabs{display:flex;align-items:center;gap:4px;overflow-x:auto;flex:none;border-bottom:1px solid var(--dsf-line);padding:6px 8px;background:var(--dsf-card);scrollbar-width:none}
.dsf-tabs::-webkit-scrollbar{display:none}
.dsf-tab{display:flex;align-items:center;flex:none;border-radius:9px;background:var(--dsf-sunken)}
.dsf-tab[aria-selected=true]{background:color-mix(in srgb,var(--dsf-blue) 16%,var(--dsf-sunken))}
.dsf-tab .dsf-btn{background:transparent;height:26px;padding:0 8px;border:0;font-size:12px;max-width:150px}
.dsf-tab .dsf-btn:first-child{overflow:hidden;text-overflow:ellipsis;display:block;white-space:nowrap}
.dsf-tab .dsf-btn:last-child{color:var(--dsf-ink-3);padding:0 6px}
.dsf-conversation{display:flex;flex-direction:column;flex:1;min-height:0}
.dsf-chat-head{display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid var(--dsf-line);flex:none}
.dsf-chat-head .dsf-name{font-size:12.5px}
.dsf-messages{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;padding:12px 12px 4px;display:flex;flex-direction:column;gap:3px;overflow-anchor:none;scrollbar-width:thin}
.dsf-messages::-webkit-scrollbar{width:9px}.dsf-messages::-webkit-scrollbar-thumb{background:color-mix(in srgb,var(--dsf-ink-3) 35%,transparent);border-radius:9px;border:2px solid var(--dsf-card)}
.dsf-message{max-width:78%;align-self:flex-start;min-width:0;display:flex;flex-direction:column;gap:2px;align-items:flex-start;margin-top:6px}
.dsf-message.mine{align-self:flex-end;align-items:flex-end}
.dsf-message-body{white-space:pre-wrap;overflow-wrap:anywhere;padding:7px 11px;border-radius:14px 14px 14px 5px;background:color-mix(in srgb,var(--dsf-ink) 7%,transparent);font-size:12.5px;line-height:1.55;user-select:text}
.dsf-message.mine .dsf-message-body{border-radius:14px 14px 5px 14px;background:color-mix(in srgb,var(--dsf-blue) 16%,transparent)}
.dsf-message time{font-size:10px;color:var(--dsf-ink-3);padding:0 3px}
.dsf-compose{flex:none;border-top:1px solid var(--dsf-line);padding:9px 10px 10px;display:flex;flex-direction:column;gap:6px}
.dsf-compose-box{display:flex;align-items:flex-end;gap:6px;background:var(--dsf-sunken);border:1px solid transparent;border-radius:12px;padding:5px 5px 5px 8px}
.dsf-compose-box:focus-within{border-color:var(--dsf-blue)}
.dsf-compose textarea{resize:none;flex:1;width:100%;min-height:28px;max-height:120px;padding:3px 0;color:var(--dsf-ink);background:transparent;border:0;outline:none;font:inherit;font-size:12.5px;line-height:1.5}
.dsf-compose textarea::placeholder{color:var(--dsf-ink-3)}
.dsf-send{all:unset;cursor:pointer;flex:none;width:28px;height:28px;border-radius:9px;display:grid;place-items:center;background:var(--dsf-blue);color:var(--dsw-alias-label-primary-foreground,#fff)}
.dsf-send:disabled{opacity:.4;cursor:default}
.dsf-compose-meta{display:flex;align-items:center;gap:8px;justify-content:space-between;padding:0 2px}
.dsf-conversation .dsf-alert{margin:6px 12px;flex:none}
.dsf-empty{display:flex;flex-direction:column;align-items:center;gap:7px;text-align:center;padding:18px 16px;color:var(--dsf-ink-3)}
.dsf-empty .dsf-empty-icon{width:34px;height:34px;opacity:.45}
.dsf-empty p{max-width:250px;font-size:12px;line-height:1.6}
.dsf-hero{display:flex;flex-direction:column;align-items:center;gap:10px;text-align:center;padding:26px 18px}
.dsf-hero .dsf-hero-icon{width:44px;height:44px;border-radius:13px;display:grid;place-items:center;background:color-mix(in srgb,var(--dsf-blue) 15%,transparent);color:var(--dsf-blue)}
.dsf-hero h1{font-size:15px}
.dsf-notice{font-size:11.5px;color:var(--dsf-ink-3);display:flex;align-items:center;gap:6px;padding:2px 2px 4px}

.dsf-selfblock{display:flex;flex-direction:column;gap:6px;padding:2px 2px 8px;border-bottom:1px solid var(--dsf-line);margin-bottom:4px}
.dsf-status-select{height:26px;padding:0 6px;border-radius:8px;font-size:11.5px;background:var(--dsf-sunken);border:1px solid transparent;color:var(--dsf-ink-2);max-width:104px}
.dsf-selfdetails{border:0;background:transparent;padding:0}
.dsf-selfdetails>summary{font-size:11.5px;color:var(--dsf-ink-3);padding:2px 4px;border-radius:7px;width:max-content}
.dsf-selfdetails>summary:hover{color:var(--dsf-ink-2);background:var(--dsf-hover)}
.dsf-stack{display:flex;flex-direction:column;gap:7px;padding:8px 4px 2px}.dsf-stack label.dsf-btn{cursor:pointer}.dsf-stack>input{width:100%}
.dsf-word-row{gap:8px}.dsf-word-row input{flex:none;width:132px;text-align:center;background:var(--dsf-sunken);border:1px solid var(--dsf-line)}
.dsf-foot-row{all:unset;box-sizing:border-box;cursor:pointer;display:flex;align-items:center;gap:10px;height:36px;padding:0 10px;border-radius:9px;color:var(--dsw-alias-label-secondary);font:inherit;font-size:13px;flex:1;min-width:0}
.dsf-foot-row:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.dsf-foot-row[data-open]{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.dsf-foot-row .dsf-foot-icon{display:grid;place-items:center;flex:none;width:18px;height:18px}
.dsf-foot-row .dsf-foot-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsf-foot-badge{margin-left:auto;min-width:17px;height:17px;padding:0 5px;border-radius:99px;background:var(--dsw-alias-state-error-primary);color:#fff;font-size:10.5px;font-weight:600;display:inline-flex;align-items:center;justify-content:center}
.dsf-foot-row:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:-2px}
@media(max-width:520px){.dsf-launcher{right:10px;bottom:10px}.dsf-friend .dsf-actions{opacity:1}.dsf-titlebar{padding-left:8px}}
`;
    const initial = (name) => [...(name || '?').trim()][0] || '?';
    const formatCode = (code) => (code || '').replace(/(.{6})(?=.)/g, '$1-');

    // All state lives outside the page slot: changing DSH pages does not close chats.
    function createController(t) {
      let state = { ready: false, hasIdentity: false, user: null, friends: [], incoming: [], outgoing: [], link: 'idle', status: 'online', effectiveStatus: 'offline', paused: false, serviceUrl: '', error: '', revision: -1 };
      const windowState = (x, width, height) => ({ open: false, minimized: false, x, y: 70, width, height, z: 1 });
      let ui = { friends: windowState(36, 340, 500), chat: windowState(400, 460, 560), tabs: [], active: '', chats: {}, avatars: {}, avatarAt: {} };
      let toasts = [], disposed = false, timer = 0, inFlight = false, seenOnline = null, seenRequests = null;
      let cursor = 0, epoch = '', seeded = false, generation = 0, lastTouch = 0, toastSeq = 0, z = 1, autoResumed = false;
      const listeners = new Set(), toastTimers = new Set(), seenMessages = new Set(), readFlights = new Set();
      const abort = new AbortController();
      const viewOps = new Set(['register', 'updateProfile', 'setStatus', 'pause', 'resume', 'addFriend', 'respond', 'removeFriend', 'forget', 'deleteAccount', 'state']);
      const emit = () => { if (!disposed) for (const fn of listeners) fn(); };
      const describe = (code) => { const key = `error_${code}`; const value = t(key); return value && value !== key ? value : t('error_generic'); };
      const blankChat = () => ({ messages: [], more: false, peerRead: 0, draft: '', pending: null, sending: false, loading: false, loaded: false, error: '', readUpTo: 0 });
      function patchUI(patch) { if (disposed) return; ui = { ...ui, ...patch }; emit(); }
      // Avatar bytes are fetched once per version; snapshots only carry the version number.
      const avatarFlights = new Set();
      function ensureAvatar(userId, version) {
        if (!userId || disposed) return;
        const at = Number.isSafeInteger(version) ? version : 0;
        if (at <= 0) {
          if (ui.avatars[userId] || ui.avatarAt[userId]) patchUI({ avatars: { ...ui.avatars, [userId]: '' }, avatarAt: { ...ui.avatarAt, [userId]: 0 } });
          return;
        }
        if (ui.avatarAt[userId] === at || avatarFlights.has(userId)) return;
        avatarFlights.add(userId);
        rpc('avatar', { userId, version: at }).then((result) => {
          const url = typeof result?.avatar === 'string' && result.avatar.startsWith('data:image/') ? result.avatar : '';
          patchUI({ avatars: { ...ui.avatars, [userId]: url }, avatarAt: { ...ui.avatarAt, [userId]: at } });
        }).catch(() => { /* retried on the next snapshot */ }).finally(() => avatarFlights.delete(userId));
      }
      function patchChat(id, patch) { patchUI({ chats: { ...ui.chats, [id]: { ...(ui.chats[id] || blankChat()), ...patch } } }); }
      function mergeMessages(a, b) { return [...new Map([...a, ...b].map((m) => [m.id, m])).values()].sort((a, b) => a.id - b.id).slice(-1000); }
      async function rpc(op, input = {}) {
        let response;
        try {
          response = await fetch(new URL('api/dsh-friends.rpc', document.baseURI), {
            method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...input, op }), signal: AbortSignal.any([abort.signal, AbortSignal.timeout(op === 'wait' ? 30000 : 20000)]),
          });
        } catch { throw new Error(t('error_host')); }
        if (response.status === 404) throw new Error(t('error_inactive'));
        let result;
        try { result = await response.json(); } catch { throw new Error(t('error_generic')); }
        if (!response.ok) throw new Error(describe(result?.error));
        return result;
      }
      function dismissToast(id) { toasts = toasts.filter((x) => x.id !== id); emit(); }
      function toast(text, friendId = '') {
        if (disposed) return;
        const id = ++toastSeq;
        toasts = [...toasts.slice(-2), { id, text, friendId }]; emit();
        const handle = setTimeout(() => { toastTimers.delete(handle); dismissToast(id); }, 6000);
        toastTimers.add(handle);
      }
      function isReading(id) { return ui.chat.open && !ui.chat.minimized && ui.active === id && document.visibilityState === 'visible' && document.hasFocus(); }
      function receive(message, notify = true) {
        if (!message || !Number.isSafeInteger(message.id) || !state.user) return;
        const peer = message.from === state.user.id ? message.to : message.from;
        if (!state.friends.some((f) => f.id === peer)) return;
        const key = `${peer}:${message.id}`;
        const duplicate = seenMessages.has(key);
        seenMessages.add(key);
        if (seenMessages.size > 3000) seenMessages.delete(seenMessages.values().next().value);
        const chat = ui.chats[peer];
        if (chat?.loaded) patchChat(peer, { messages: mergeMessages(chat.messages, [message]) });
        if (notify && !duplicate && message.to === state.user.id && !isReading(peer)) {
          const friend = state.friends.find((f) => f.id === peer);
          toast(`${friend.name} ${t('newMessage')}: ${[...message.body].slice(0, 80).join('')}`, peer);
        }
      }
      function accept(next, notifyMessages = seeded) {
        if (disposed || !next || !Array.isArray(next.friends)) return;
        const changedIdentity = state.user?.id !== next.user?.id || (state.serviceUrl && state.serviceUrl !== next.serviceUrl);
        if (changedIdentity) {
          generation++; cursor = 0; epoch = ''; seeded = false; notifyMessages = false;
          seenOnline = null; seenRequests = null; seenMessages.clear(); toasts = [];
          patchUI({ tabs: [], active: '', chats: {}, chat: { ...ui.chat, open: false } });
        }
        const online = new Map(next.friends.map((f) => [f.id, f.status !== 'offline']));
        if (seenOnline && next.hasIdentity) for (const f of next.friends) if (online.get(f.id) && seenOnline.get(f.id) === false) toast(`${f.name} ${t('joined')}`);
        if (seenRequests && next.hasIdentity) for (const r of next.incoming) if (!seenRequests.has(r.id)) toast(`${r.from.name} ${t('newRequest')}`);
        seenOnline = next.hasIdentity ? online : null;
        seenRequests = next.hasIdentity ? new Set(next.incoming.map((r) => r.id)) : null;
        // Never pass history/send/markRead results through this view reducer.
        const { events, cursor: unusedCursor, inboxEpoch, ...view } = next;
        state = { ...state, ...view, ready: true, error: next.error || '' }; emit();
        // The pause control is gone from the UI, so an old paused flag must not strand anyone.
        if (state.paused && !autoResumed) {
          autoResumed = true;
          rpc('resume').then((result) => { if (result) accept(result); }).catch(() => {});
        }
        if (state.user?.id) ensureAvatar(state.user.id, state.user.avatarAt);
        for (const friend of state.friends) ensureAvatar(friend.id, friend.avatarAt);
        const ids = new Set(state.friends.map((f) => f.id));
        if (ui.tabs.some((id) => !ids.has(id))) {
          const tabs = ui.tabs.filter((id) => ids.has(id));
          patchUI({ tabs, active: ids.has(ui.active) ? ui.active : tabs[0] || '', chats: Object.fromEntries(Object.entries(ui.chats).filter(([id]) => ids.has(id))), chat: tabs.length ? ui.chat : { ...ui.chat, open: false } });
        }
        for (const friend of state.friends) if (friend.lastMessage) {
          const chat = ui.chats[friend.id];
          // A snapshot catches dropped events; refresh an open conversation on gaps.
          const last = chat?.messages.at(-1)?.id || 0;
          if (chat?.loaded && !chat.loading && friend.lastMessage.id > last) loadHistory(friend.id, undefined, last);
          receive(friend.lastMessage, notifyMessages);
        }
      }
      async function loadHistory(friendId, before, after) {
        const chat = ui.chats[friendId];
        if (!chat || chat.loading || disposed) return;
        const version = generation;
        patchChat(friendId, { loading: true, error: '' });
        try {
          let result, messages = [], tail = after;
          // after is used only to fill a live-event gap; capped by server retention.
          for (let page = 0; page < 11; page++) {
            result = await rpc('history', { friendId, ...(before ? { before } : {}), ...(tail ? { after: tail } : {}) });
            messages = mergeMessages(messages, result.messages || []);
            if (!tail || !result.more || !result.messages?.length) break;
            tail = result.messages.at(-1).id;
          }
          if (disposed || generation !== version || !ui.chats[friendId]) return;
          const current = ui.chats[friendId];
          patchChat(friendId, { messages: mergeMessages(current.messages, messages), loaded: true, loading: false,
            more: before || !current.loaded || !after ? !!result.more : current.more, peerRead: Math.max(current.peerRead, result.peerRead || 0) });
        } catch (error) {
          if (!disposed && generation === version && ui.chats[friendId]) patchChat(friendId, { loading: false, error: error.message });
        }
      }
      async function sendMessage(friendId) {
        const chat = ui.chats[friendId];
        if (!chat || chat.sending || !chat.draft.trim() || disposed) return;
        if ([...chat.draft].length > 2000) { patchChat(friendId, { error: t('messageLimit') }); return; }
        // A failed attempt keeps the exact body and id; retry is explicit, never automatic.
        const pending = chat.pending || { body: chat.draft, clientId: crypto.randomUUID() };
        const version = generation;
        patchChat(friendId, { pending, sending: true, error: '' });
        try {
          const result = await rpc('send', { friendId, ...pending });
          if (disposed || generation !== version || !ui.chats[friendId]) return;
          const current = ui.chats[friendId];
          receive(result.message, false);
          patchChat(friendId, { messages: mergeMessages(ui.chats[friendId].messages, [result.message]), draft: current.draft === pending.body ? '' : current.draft, pending: null, sending: false });
        } catch {
          if (!disposed && generation === version && ui.chats[friendId]) patchChat(friendId, { sending: false, error: t('messageFailed') });
        }
      }
      async function reportVisible(friendId, upTo) {
        const chat = ui.chats[friendId];
        if (!chat || !isReading(friendId) || !Number.isSafeInteger(upTo) || upTo <= chat.readUpTo || readFlights.has(friendId)) return;
        // Only ids measured in the rendered incoming-message viewport are accepted.
        if (!chat.messages.some((m) => m.id === upTo && m.to === state.user?.id)) return;
        const version = generation;
        readFlights.add(friendId);
        try {
          const result = await rpc('markRead', { friendId, upTo });
          if (disposed || generation !== version || !ui.chats[friendId]) return;
          patchChat(friendId, { readUpTo: Math.max(ui.chats[friendId].readUpTo, result.upTo || upTo) });
          state = { ...state, friends: state.friends.map((f) => f.id === friendId && f.lastMessage?.id <= upTo ? { ...f, unread: 0 } : f) }; emit();
        } catch { /* Retry only after another viewport/focus/message observation. */ }
        finally { readFlights.delete(friendId); }
      }
      function setWindow(name, patch) { patchUI({ [name]: { ...ui[name], ...patch } }); }
      // First open docks the list near the launcher instead of on top of the sidebar.
      let friendsPlaced = false;
      function openFriends() {
        if (!friendsPlaced) {
          friendsPlaced = true;
          const rect = ui.friends;
          const x = Math.max(16, (window.innerWidth || 1024) - rect.width - 24);
          const y = Math.max(16, (window.innerHeight || 768) - rect.height - 76);
          setWindow('friends', { x, y });
        }
        setWindow('friends', { open: true, minimized: false, z: ++z });
      }
      let chatPlaced = false;
      function openChat(friendId) {
        if (!state.friends.some((f) => f.id === friendId)) return;
        // First chat docks left of the friends list so the two windows line up.
        if (!chatPlaced) { chatPlaced = true; if (ui.friends.open) setWindow('chat', { x: Math.max(16, ui.friends.x - ui.chat.width - 16), y: ui.friends.y }); }
        patchUI({ tabs: ui.tabs.includes(friendId) ? ui.tabs : [...ui.tabs, friendId], active: friendId,
          chat: { ...ui.chat, open: true, minimized: false, z: ++z }, chats: { ...ui.chats, [friendId]: ui.chats[friendId] || blankChat() } });
        loadHistory(friendId);
      }
      function closeTab(id) {
        const tabs = ui.tabs.filter((x) => x !== id);
        // Retain drafts and failed clientIds when closing a tab/window, until identity disposal.
        patchUI({ tabs, active: ui.active === id ? tabs.at(-1) || '' : ui.active, chat: { ...ui.chat, open: !!tabs.length } });
      }
      async function sync(initial = false) {
        if (disposed || inFlight) return;
        inFlight = true;
        const started = Date.now(), version = generation;
        let delay = 3000;
        try {
          if (initial) { const result = await rpc('state'); if (version === generation) accept(result, false); }
          else {
            const result = await rpc('wait', { since: cursor, revision: state.revision });
            if (disposed || version !== generation) return;
            const epochChanged = !!epoch && epoch !== result.inboxEpoch;
            if (epochChanged) {
              cursor = 0; seeded = false; seenMessages.clear(); generation++; readFlights.clear();
              patchUI({ chats: Object.fromEntries(Object.entries(ui.chats).map(([id, chat]) => [id, { ...chat, loading: false, sending: false, readUpTo: 0 }])) });
            }
            const notify = seeded && !epochChanged;
            accept(result, notify);
            if (typeof result.inboxEpoch === 'string' && Array.isArray(result.events)) {
              epoch = result.inboxEpoch;
              const previous = cursor;
              for (const event of result.events) {
                if (event.seq <= previous) continue;
                if (event.kind === 'message') receive(event.data, notify);
                if (event.kind === 'read' && event.data?.reader !== state.user?.id) {
                  const id = event.data?.reader, chat = ui.chats[id];
                  if (chat) patchChat(id, { peerRead: Math.max(chat.peerRead, event.data.upTo || 0) });
                }
              }
              // A changed epoch requires a fresh since:0 seed, not the old Host's cursor.
              cursor = epochChanged ? 0 : Math.max(cursor, result.cursor || 0);
              seeded = !epochChanged;
              delay = Math.max(150, 250 - (Date.now() - started));
            }
          }
        } catch (error) {
          if (!disposed) {
            state = { ...state, ready: true, error: error.message }; emit();
            // Compatible fallback for an older Host; never run concurrently with wait.
            if (!initial) try { accept(await rpc('state')); } catch { /* keep last good view */ }
          }
        } finally {
          inFlight = false; clearTimeout(timer);
          if (!disposed) timer = setTimeout(() => sync(), delay);
        }
      }
      function touch() {
        if (document.visibilityState !== 'visible' || !document.hasFocus() || Date.now() - lastTouch < 60000) return;
        lastTouch = Date.now(); rpc('touch').catch(() => {});
      }
      const onActivity = () => touch();
      document.addEventListener('visibilitychange', onActivity);
      window.addEventListener('focus', onActivity);
      window.addEventListener('pointerdown', onActivity, true);
      window.addEventListener('keydown', onActivity, true);
      sync(true); touch();
      return {
        getState: () => state, getToasts: () => toasts, getUI: () => ui,
        subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
        async run(op, input) { const result = await rpc(op, input); if (viewOps.has(op)) accept(result); return result; },
        toast, dismissToast, openFriends, openChat, closeTab, setWindow, reportVisible, sendMessage, loadHistory,
        focusWindow(name) { if (ui[name].z !== z) setWindow(name, { z: ++z }); },
        setDraft(id, draft) { const chat = ui.chats[id]; if (chat && !chat.sending) patchChat(id, { draft, pending: chat.pending?.body === draft ? chat.pending : null, error: '' }); },
        dispose() {
          disposed = true; clearTimeout(timer); for (const handle of toastTimers) clearTimeout(handle);
          abort.abort(); listeners.clear(); generation++;
          document.removeEventListener('visibilitychange', onActivity);
          window.removeEventListener('focus', onActivity);
          window.removeEventListener('pointerdown', onActivity, true);
          window.removeEventListener('keydown', onActivity, true);
        },
      };
    }

    function Icon({ size = 20 } = {}) {
      return h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', 'aria-hidden': true },
        h('circle', { cx: 9, cy: 8, r: 3.2 }), h('path', { d: 'M3 20v-1.5a6 6 0 0 1 12 0V20M16 4.8a3.2 3.2 0 0 1 0 6.4M18.5 14.6A5.5 5.5 0 0 1 21 19.4V20' }));
    }

    // Small stroke icon set so the float uses glyph buttons instead of text walls.
    function Glyph({ name, size = 16 } = {}) {
      const paths = {
        chat: 'M4 5.5h16v10.5H9.5L5 19.5V16H4z',
        close: 'M6.5 6.5l11 11M17.5 6.5l-11 11',
        minimize: 'M6 12h12',
        restore: 'M6 9h9v9M9 6h9v9',
        send: 'M4.5 12h13M11 5.5l6.5 6.5L11 18.5',
        copy: 'M9.5 9.5h9v9h-9zM5.5 14.5v-9h9',
        gear: 'M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4zM12 3.5v2M12 18.5v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M3.5 12h2M18.5 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
        trash: 'M5.5 7.5h13M9.5 7.5V5.5h5v2M7 7.5l.8 11h8.4L17 7.5',
        plus: 'M12 5.5v13M5.5 12h13',
        check: 'M5.5 12.5l4.2 4.2L18.5 8',
        pause: 'M9.5 6v12M14.5 6v12',
        play: 'M9 5.5l9.5 6.5L9 18.5z',
      };
      return h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, focusable: 'false' },
        ...String(paths[name] || '').split('M').filter(Boolean).map((segment, index) => h('path', { key: index, d: `M${segment}` })));
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-friends: dictionaries');
        const t = ctx.locale.bind(NS);
        const controller = createController(t);
        ctx.effect(() => () => controller.dispose(), 'dsh-friends: controller');
        const useStore = () => React.useSyncExternalStore(controller.subscribe, controller.getState);
        const useToasts = () => React.useSyncExternalStore(controller.subscribe, controller.getToasts);

        function useAction() {
          const [busy, setBusy] = React.useState('');
          const [error, setError] = React.useState('');
          const act = React.useCallback(async (key, op, input, onDone) => {
            if (busy) return;
            setBusy(key); setError('');
            try { const result = await controller.run(op, input); onDone?.(result); }
            catch (e) { setError(e.message || t('error_generic')); }
            finally { setBusy(''); }
          }, [busy]);
          return { busy, error, act, setError };
        }
        // Host errors arrive as short codes like 'unreachable'; never show one raw in the UI.
        const errorText = (raw) => { if (!raw) return ''; const key = `error_${raw}`; const value = t(key); return value && value !== key ? value : raw; };
        const Button = ({ label, onClick, disabled, tone = '', type = 'button' }) => h('button', { type, className: `dsf-btn ${tone}`, disabled, onClick }, label);
        function Confirm({ text, label, tone = 'danger', busy, onConfirm, onCancel }) {
          return h('div', { className: 'dsf-row', role: 'group' },
            h('span', { className: 'dsf-muted dsf-grow' }, text),
            h(Button, { label: t('back'), tone: 'ghost', onClick: onCancel, disabled: busy }),
            h(Button, { label: label || t('confirm'), tone, onClick: onConfirm, disabled: busy }));
        }
        const NO_AVATARS = {};
        const useAvatars = () => React.useSyncExternalStore(controller.subscribe, () => controller.getUI().avatars || NO_AVATARS);
        const Avatar = ({ url, name, status, small }) => h('div', { className: `dsf-avatar${small ? ' small' : ''}`, 'data-status': status, 'aria-hidden': true },
          url ? h('img', { className: 'dsf-avatar-img', src: url, alt: '' }) : initial(name),
          status && h('span', { className: 'dsf-dot', 'data-status': status }));
        // Downscale to 96px JPEG so a phone screenshot still becomes a few KB.
        async function compressAvatar(file) {
          if (!file || !/^image\/(png|jpeg|webp)$/i.test(file.type)) throw new Error(t('avatarType'));
          if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') throw new Error(t('avatarType'));
          const bitmap = await createImageBitmap(file);
          const size = 96;
          const canvas = document.createElement('canvas');
          canvas.width = size; canvas.height = size;
          const context = canvas.getContext('2d');
          const scale = Math.max(size / bitmap.width, size / bitmap.height);
          const width = bitmap.width * scale, height = bitmap.height * scale;
          context.drawImage(bitmap, (size - width) / 2, (size - height) / 2, width, height);
          bitmap.close?.();
          let quality = 0.86, data = canvas.toDataURL('image/jpeg', quality);
          while (data.length > 24_000 && quality > 0.35) { quality -= 0.15; data = canvas.toDataURL('image/jpeg', quality); }
          if (data.length > 28_000) throw new Error(t('avatarTooBig'));
          return data;
        }
        const DEFAULT_WORDS = { running: 'running', active: 'using', idle: 'idle', away: 'away', busy: 'busy' };
        const wordOf = (entity) => entity?.statusLabel || (entity?.status === 'online' ? t(DEFAULT_WORDS[entity.activity] || 'online') : '');
        function elapsedText(ms) {
          const total = Math.max(0, Math.floor(ms / 1000));
          const minutes = Math.floor(total / 60), seconds = total % 60;
          if (minutes >= 60) return `${Math.floor(minutes / 60)} ${t('hourShort')} ${minutes % 60} ${t('minuteShort')}`;
          return `${minutes}:${String(seconds).padStart(2, '0')}`;
        }
        function tokensText(value) {
          const n = Number(value) || 0;
          return n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n);
        }
        function useSecondWhile(active) {
          const [, bump] = React.useState(0);
          React.useEffect(() => { if (!active) return undefined; const id = setInterval(() => bump((n) => n + 1), 1_000); return () => clearInterval(id); }, [active]);
          return null;
        }
        function lastSeenText(at) {
          if (!at) return t('offline');
          const minutes = Math.floor((Date.now() - at) / 60000);
          const ago = minutes < 1 ? t('justNow') : minutes < 60 ? `${minutes} ${t('minutes')}` : minutes < 1440 ? `${Math.floor(minutes / 60)} ${t('hours')}` : `${Math.floor(minutes / 1440)} ${t('days')}`;
          return `${t('lastSeen')} · ${ago}`;
        }

        function Welcome({ state }) {
          const [name, setName] = React.useState('');
          const [code, setCode] = React.useState('');
          const [claim, setClaim] = React.useState('');
          const { busy, error, act } = useAction();
          return h('section', { className: 'dsf-panel' },
            h('h2', null, t('welcome')), h('p', { className: 'dsf-muted' }, t('welcomeSub')),
            h('form', { className: 'dsf-row', onSubmit: (e) => { e.preventDefault(); act('create', 'register', { name: name.trim(), signupCode: code }, () => setCode('')); } },
              h('input', { value: name, onChange: (e) => setName(e.target.value), placeholder: t('nickname'), 'aria-label': t('nickname'), maxLength: 32, required: true, autoComplete: 'nickname' }),
              h(Button, { type: 'submit', tone: 'primary', label: t('create'), disabled: !!busy || !name.trim() })),
            h('details', null, h('summary', null, t('transfer')),
              h('p', { className: 'dsf-faint' }, t('transferHint')),
              h('form', { className: 'dsf-row', onSubmit: (e) => { e.preventDefault(); act('claim', 'transferClaim', { code: claim }, () => { setClaim(''); }); } },
                h('input', { value: claim, onChange: (e) => setClaim(e.target.value.toUpperCase()), placeholder: t('transferCode'), 'aria-label': t('transferCode'), maxLength: 12, autoComplete: 'off', spellCheck: false }),
                h(Button, { type: 'submit', tone: 'primary', label: t('transferClaim'), disabled: !!busy || !claim.trim() }))),
            h('details', null, h('summary', null, t('signup')),
              h('input', { value: code, onChange: (e) => setCode(e.target.value), type: 'password', autoComplete: 'off', maxLength: 256, 'aria-label': t('signup'), style: { width: '100%' } })),
            error && h('p', { className: 'dsf-alert error', role: 'alert' }, error),
            h('p', { className: 'dsf-faint' }, t('identityNote')),
            state.serviceUrl && h('p', { className: 'dsf-faint' }, `${t('service')}: ${state.serviceUrl}`));
        }

        // Compact identity block: avatar, name, presence, and a disclosure for the rest.
        const WORD_KEYS = { running: 'wordRunning', active: 'wordActive', idle: 'wordIdle', away: 'wordAway', busy: 'wordBusy', online: 'wordOnline' };
        function Me({ state }) {
          const { busy, error, act } = useAction();
          useSecondWhile(!!state.taskRunning);
          const avatars = useAvatars();
          const [message, setMessage] = React.useState(state.user?.message ?? '');
          const [renaming, setRenaming] = React.useState(false);
          const [name, setName] = React.useState('');
          const [words, setWords] = React.useState(state.user?.labels || {});
          const [transfer, setTransfer] = React.useState(null);
          React.useEffect(() => { setWords(state.user?.labels || {}); }, [state.user?.labels?.online, state.user?.labels?.away, state.user?.labels?.busy]);
          const pickAvatar = async (event) => {
            const file = event.target.files?.[0]; event.target.value = '';
            if (!file) return;
            try { const data = await compressAvatar(file); await act('avatar', 'updateProfile', { avatar: data }); }
            catch (e) { setError(e.message || t('error_generic')); }
          };
          React.useEffect(() => { setMessage(state.user?.message ?? ''); }, [state.user?.message]);
          const shown = state.paused ? 'offline' : state.effectiveStatus === 'invisible' ? 'offline' : state.effectiveStatus;
          const custom = state.user?.labels?.[state.status] || '';
          const label = state.paused ? t('paused') : custom || (state.status === 'online' && state.effectiveStatus === 'away' ? t('autoAway') : t(state.status));
          const copy = async () => { try { await navigator.clipboard.writeText(state.user.code); controller.toast(t('copied')); } catch { controller.toast(t('copyFail')); } };
          return h('section', { className: 'dsf-selfblock' },
            h('div', { className: 'dsf-self' },
              h(Avatar, { url: avatars[state.user?.id], name: state.user?.name, status: shown }),
              h('div', { className: 'dsf-grow' },
                renaming
                  ? h('form', { className: 'dsf-row', onSubmit: (e) => { e.preventDefault(); act('rename', 'updateProfile', { name: name.trim() }, () => setRenaming(false)); } },
                      h('input', { value: name, onChange: (e) => setName(e.target.value), maxLength: 32, required: true, autoFocus: true, 'aria-label': t('rename') }),
                      h(Button, { type: 'submit', label: t('save'), disabled: !!busy || !name.trim() }), h(Button, { label: t('back'), tone: 'ghost', onClick: () => setRenaming(false) }))
                  : h('div', { className: 'dsf-name' }, state.user?.name),
                h('div', { className: 'dsf-sub', 'data-status': shown },
                  state.taskRunning ? `${t('running')} · ${elapsedText(Date.now() - state.taskStartedAt)}`
                    : state.user?.message && shown !== 'offline' ? state.user.message : label)),
              h('select', { className: 'dsf-status-select', value: state.status, disabled: !!busy || state.paused, 'aria-label': t('online'), onChange: (e) => act('status', 'setStatus', { status: e.target.value }) },
                ...STATUSES.map((s) => h('option', { key: s, value: s }, t(s)))),
              null),
            state.usage && h('div', { className: 'dsf-usage' },
              h(Glyph, { name: 'check', size: 12 }),
              `${t('today')} ${tokensText(state.usage.tokens)} ${t('tokens')} · ${state.usage.calls} ${t('calls')}`),
            h('details', { className: 'dsf-selfdetails' },
              h('summary', null, h('span', { className: 'dsf-row' }, h(Glyph, { name: 'gear', size: 13 }), t('profile'))),
              h('div', { className: 'dsf-stack' },
                h('div', { className: 'dsf-row' },
                  h(Avatar, { url: avatars[state.user?.id], name: state.user?.name }),
                  h('label', { className: 'dsf-btn' }, t('changeAvatar'), h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', onChange: pickAvatar, style: { display: 'none' }, 'aria-label': t('changeAvatar') })),
                  avatars[state.user?.id] && h(Button, { label: t('removeAvatar'), tone: 'ghost', disabled: !!busy, onClick: () => act('avatar', 'updateProfile', { avatar: '' }) })),
                h('div', { className: 'dsf-row' }, h('span', { className: 'dsf-faint dsf-grow' }, t('signature')),
                  h(Button, { label: t('save'), tone: 'ghost', disabled: !!busy || message === (state.user?.message ?? ''), onClick: () => act('message', 'updateProfile', { message }) })),
                h('form', { className: 'dsf-row', onSubmit: (e) => { e.preventDefault(); act('message', 'updateProfile', { message }); } },
                  h('input', { value: message, onChange: (e) => setMessage(e.target.value), maxLength: 140, placeholder: t('signaturePlaceholder'), 'aria-label': t('signature') })),
                h('div', { className: 'dsf-row' }, h('span', { className: 'dsf-faint dsf-grow' }, t('words'), h('span', { className: 'dsf-faint' }, ` · ${t('wordsHint')}`))),
                ['running', 'active', 'idle', 'away', 'busy'].map((key) => h('div', { key, className: 'dsf-row dsf-word-row' },
                  h('span', { className: 'dsf-faint dsf-grow' }, t(WORD_KEYS[key])),
                  h('input', {
                    value: words[key] || '', maxLength: 12, placeholder: t(DEFAULT_WORDS[key] || 'online'), 'aria-label': t(WORD_KEYS[key]),
                    onChange: (e) => setWords({ ...words, [key]: e.target.value }),
                  }))),
                h('div', { className: 'dsf-row' }, h('span', { className: 'dsf-grow' }),
                  h(Button, { label: t('saveProfile'), tone: 'primary', disabled: !!busy, onClick: () => act('words', 'updateProfile', { labels: words }, () => controller.toast(t('saved'))) })),
                h('div', { className: 'dsf-row' }, h('span', { className: 'dsf-code dsf-grow' }, formatCode(state.user?.code)), h(Button, { label: t('copy'), onClick: copy })),
                h('div', { className: 'dsf-row' }, h('span', { className: 'dsf-faint dsf-grow' }, t('transfer')),
                  h(Button, { label: t('transferMint'), tone: 'ghost', disabled: !!busy, onClick: () => act('mint', 'transferStart', { mode: 'move' }, (result) => setTransfer(result)) }),
                  h(Button, { label: t('transferShare'), tone: 'ghost', disabled: !!busy, onClick: () => act('share', 'transferStart', { mode: 'share' }, (result) => setTransfer(result)) })),
                transfer?.code && h('div', { className: 'dsf-stack', style: { gap: 4 } },
                  h('div', { className: 'dsf-row' }, h('span', { className: 'dsf-code dsf-grow', style: { fontSize: 15, letterSpacing: '.16em' } }, transfer.code),
                    h(Button, { label: t('copy'), onClick: async () => { try { await navigator.clipboard.writeText(transfer.code); controller.toast(t('copied')); } catch { controller.toast(t('copyFail')); } } })),
                  h('span', { className: 'dsf-faint' }, t('transferExpires')),
                  h('span', { className: 'dsf-faint' }, transfer.mode === 'share' ? t('transferShareHint') : t('transferMoveHint'))),
                h('div', { className: 'dsf-row' },
                  h(Button, { label: t('rename'), tone: 'ghost', onClick: () => { setName(state.user?.name ?? ''); setRenaming(true); } })),
                state.status === 'invisible' && h('p', { className: 'dsf-faint' }, t('invisibleNote')))),
            error && h('p', { className: 'dsf-alert error', role: 'alert' }, error));
        }

        function AddFriend() {
          const [code, setCode] = React.useState('');
          const { busy, error, act } = useAction();
          return h('form', { className: 'dsf-panel', onSubmit: (e) => { e.preventDefault(); act('add', 'addFriend', { code }, () => { setCode(''); controller.toast(t('sent')); }); } },
            h('h2', null, t('add')),
            h('div', { className: 'dsf-row' },
              h('input', { value: code, onChange: (e) => setCode(e.target.value), placeholder: t('friendCode'), 'aria-label': t('friendCode'), maxLength: 32, autoComplete: 'off', spellCheck: false, required: true }),
              h(Button, { type: 'submit', tone: 'primary', label: t('send'), disabled: !!busy || !code.trim() })),
            error && h('p', { className: 'dsf-alert error', role: 'alert' }, error));
        }

        function Requests({ state }) {
          const { busy, error, act } = useAction();
          const avatars = useAvatars();
          if (!state.incoming.length && !state.outgoing.length) return null;
          const row = (key, person, sub, actions) => h('div', { key, className: 'dsf-friend' },
            h(Avatar, { url: avatars[person.id], name: person.name, small: true }),
            h('div', { className: 'dsf-grow' }, h('div', { className: 'dsf-name' }, person.name), h('div', { className: 'dsf-sub' }, sub)), ...actions);
          return h('section', { className: 'dsf-panel' },
            h('h2', null, `${t('requests')} · ${state.incoming.length + state.outgoing.length}`),
            ...state.incoming.map((r) => row(r.id, r.from, formatCode(r.from.code), [
              h(Button, { key: 'a', tone: 'primary', label: t('accept'), disabled: !!busy, onClick: () => act(r.id, 'respond', { requestId: r.id, action: 'accept' }) }),
              h(Button, { key: 'd', label: t('decline'), disabled: !!busy, onClick: () => act(r.id, 'respond', { requestId: r.id, action: 'decline' }) })])),
            ...state.outgoing.map((r) => row(r.id, r.to, t('waiting'), [
              h(Button, { key: 'c', tone: 'ghost', label: t('cancel'), disabled: !!busy, onClick: () => act(r.id, 'respond', { requestId: r.id, action: 'cancel' }) })])),
            error && h('p', { className: 'dsf-alert error', role: 'alert' }, error));
        }

        function Friend({ friend, act, busy }) {
          const [confirming, setConfirming] = React.useState(false);
          const avatars = useAvatars();
          const sub = friend.status === 'offline' ? lastSeenText(friend.lastSeen) : friend.message || friend.statusLabel || t(friend.status);
          return h('div', { className: 'dsf-friend', 'data-status': friend.status, 'data-confirm': confirming ? '' : undefined },
            h(Avatar, { url: avatars[friend.id], name: friend.name, status: friend.status, small: true }),
            confirming
              ? h('div', { className: 'dsf-grow' }, h(Confirm, { text: t('confirmRemove'), label: t('remove'), busy: !!busy, onCancel: () => setConfirming(false), onConfirm: () => act(friend.id, 'removeFriend', { friendId: friend.id }) }))
              : h(React.Fragment, null,
                  h('div', { className: 'dsf-grow', style: { minWidth: 0 } },
                    h('div', { className: 'dsf-name' }, h('span', { className: 'dsf-grow' }, friend.name), friend.status !== 'offline' && wordOf(friend) ? h('span', { className: 'dsf-word', 'data-activity': friend.activity || undefined }, wordOf(friend)) : null, friend.unread ? h(Unread, { count: friend.unread }) : null),
                    h('div', { className: 'dsf-sub', 'data-status': friend.message || friend.lastMessage ? undefined : friend.status, title: friend.lastMessage ? `${sub} · ${friend.lastMessage.body}` : sub },
                      friend.lastMessage ? friend.lastMessage.body : sub)),
                  h('div', { className: 'dsf-actions' },
                    h('button', { type: 'button', className: 'dsf-icon-btn dsf-chat-entry', onClick: () => controller.openChat(friend.id), 'aria-label': `${t('chat')} · ${friend.name}`, title: t('chat') }, h(Glyph, { name: 'chat', size: 15 })),
                    h('button', { type: 'button', className: 'dsf-icon-btn', onClick: () => setConfirming(true), 'aria-label': `${t('remove')} · ${friend.name}`, title: t('remove') }, h(Glyph, { name: 'trash', size: 15 })))));
        }

        function FriendList({ state }) {
          const [query, setQuery] = React.useState('');
          const [collapsed, setCollapsed] = React.useState({ offline: false });
          const { busy, error, act } = useAction();
          const q = query.trim().toLocaleLowerCase();
          const match = state.friends.filter((f) => !q || f.name.toLocaleLowerCase().includes(q) || (f.message || '').toLocaleLowerCase().includes(q));
          const byName = (a, b) => a.name.localeCompare(b.name);
          const groups = [
            ['online', t('groupOnline'), match.filter((f) => f.status === 'online').sort(byName)],
            ['away', t('groupAway'), match.filter((f) => f.status === 'away' || f.status === 'busy').sort(byName)],
            ['offline', t('groupOffline'), match.filter((f) => f.status === 'offline').sort((a, b) => (b.lastSeen ?? 0) - (a.lastSeen ?? 0) || byName(a, b))],
          ];
          const online = state.friends.filter((f) => f.status !== 'offline').length;
          return h('section', { className: 'dsf-panel' },
            h('div', { className: 'dsf-row' }, h('h2', { className: 'dsf-grow dsf-hide-float' }, `${t('title')} · ${online}/${state.friends.length}`),
              state.friends.length > 5 && h('input', { type: 'search', value: query, onChange: (e) => setQuery(e.target.value), placeholder: t('search'), 'aria-label': t('search'), style: { maxWidth: 180, height: 28 } })),
            !state.friends.length
              ? h('div', { className: 'dsf-empty' },
                  h('div', { className: 'dsf-empty-icon' }, h(Icon, { size: 34 })),
                  h('p', null, t('empty')))
              : !match.length ? h('p', { className: 'dsf-muted', style: { padding: '10px 8px' } }, t('noMatch'))
              : groups.filter(([, , list]) => list.length).map(([key, label, list]) => h('div', { key, className: 'dsf-group' },
                  h('button', { type: 'button', className: 'dsf-group-head', 'aria-expanded': !collapsed[key], onClick: () => setCollapsed({ ...collapsed, [key]: !collapsed[key] }) },
                    h('span', { className: 'dsf-chev', 'aria-hidden': true }, '▾'), `${label} — ${list.length}`),
                  !collapsed[key] && list.map((f) => h(Friend, { key: f.id, friend: f, act, busy })))),
            error && h('p', { className: 'dsf-alert error', role: 'alert' }, error));
        }

        function Page() {
          const state = useStore();
          const linkText = state.hasIdentity ? t(`link_${state.link}`) : '';
          return h('div', { className: 'dsf' }, h('style', null, css), h('div', { className: 'dsf-wrap' },
            h('header', null, h('div', { className: 'dsf-row' }, h('h1', { className: 'dsf-grow' }, t('title')), h(Button, { label: t('openFriends'), onClick: controller.openFriends })), h('p', { className: 'dsf-muted' }, t('privacy'))),
            state.error && h('p', { className: 'dsf-alert error', role: 'alert' }, errorText(state.error)),
            linkText && h('p', { className: `dsf-alert${state.link === 'unauthorized' ? ' error' : ''}`, role: 'status' }, linkText),
            !state.ready ? h('p', { className: 'dsf-muted' }, t('link_connecting'))
              : !state.hasIdentity ? h(Welcome, { state })
              : h(React.Fragment, null, state.user && h(Me, { state }), h(Requests, { state }), h(FriendList, { state }), h(AddFriend))));
        }

        function Unread({ count }) { return count > 0 ? h('span', { className: 'dsf-unread', 'aria-label': `${count} ${t('unread')}` }, count > 99 ? '99+' : count) : null; }
        function fitWindow(rect) {
          const width = Math.min(rect.width, window.innerWidth || 1024), height = Math.min(rect.height, window.innerHeight || 768);
          return { ...rect, width, height, x: Math.max(0, Math.min(rect.x, (window.innerWidth || 1024) - width)), y: Math.max(0, Math.min(rect.y, (window.innerHeight || 768) - (rect.minimized ? 40 : height))) };
        }
        function FloatingWindow({ name, title, note, rect, children }) {
          const gesture = React.useRef(null);
          const visible = fitWindow(rect);
          const begin = (event, resizing) => {
            if (event.button !== 0 || (!resizing && event.target.closest?.('button,input,textarea,select,a'))) return;
            event.preventDefault(); controller.focusWindow(name);
            gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, rect: visible, resizing };
            event.currentTarget.setPointerCapture(event.pointerId);
          };
          const move = (event) => {
            const start = gesture.current;
            if (!start || start.id !== event.pointerId) return;
            const dx = event.clientX - start.x, dy = event.clientY - start.y;
            const next = start.resizing
              ? { ...start.rect, width: Math.max(280, Math.min(start.rect.width + dx, (window.innerWidth || 1024) - start.rect.x)), height: Math.max(260, Math.min(start.rect.height + dy, (window.innerHeight || 768) - start.rect.y)) }
              : { ...start.rect, x: start.rect.x + dx, y: start.rect.y + dy };
            const { x, y, width, height } = fitWindow(next);
            controller.setWindow(name, { x, y, width, height });
          };
          const end = () => { gesture.current = null; };
          const keyboard = (event, resizing) => {
            const deltas = { ArrowLeft: [-20, 0], ArrowRight: [20, 0], ArrowUp: [0, -20], ArrowDown: [0, 20] };
            if (!deltas[event.key] || (!resizing && event.target !== event.currentTarget)) return;
            event.preventDefault(); const [dx, dy] = deltas[event.key];
            controller.setWindow(name, fitWindow(resizing ? { ...visible, width: Math.max(280, visible.width + dx), height: Math.max(260, visible.height + dy) } : { ...visible, x: visible.x + dx, y: visible.y + dy }));
          };
          return h('section', { className: 'dsf dsf-float', role: 'dialog', 'aria-label': title, 'aria-modal': false,
            onPointerDownCapture: () => controller.focusWindow(name), style: { left: visible.x, top: visible.y, width: rect.minimized ? Math.min(visible.width, 280) : visible.width, height: rect.minimized ? 40 : visible.height, zIndex: rect.z + 1 } },
            h('div', { className: 'dsf-titlebar', tabIndex: 0, 'aria-label': title, onKeyDown: (e) => keyboard(e, false),
              onPointerDown: (e) => begin(e, false), onPointerMove: move, onPointerUp: end, onPointerCancel: end, onLostPointerCapture: end },
              h('span', { className: 'dsf-title-icon' }, h(Icon, { size: 16 })),
              h('strong', null, title),
              note && h('span', { className: 'dsf-title-note' }, note),
              h('div', { className: 'dsf-window-actions' },
                h('button', { type: 'button', className: 'dsf-icon-btn', 'aria-label': rect.minimized ? t('restore') : t('minimize'), title: rect.minimized ? t('restore') : t('minimize'), onClick: () => controller.setWindow(name, { minimized: !rect.minimized }) }, h(Glyph, { name: rect.minimized ? 'restore' : 'minimize', size: 15 })),
                h('button', { type: 'button', className: 'dsf-icon-btn', 'aria-label': t('close'), title: t('close'), onClick: () => controller.setWindow(name, { open: false }) }, h(Glyph, { name: 'close', size: 15 })))),
            !rect.minimized && h('div', { className: `dsf-float-body${name === 'chat' ? ' chat' : ''}` }, children),
            !rect.minimized && h('button', { className: 'dsf-resize', type: 'button', 'aria-label': t('resize'), title: t('resize'),
              onKeyDown: (e) => keyboard(e, true), onPointerDown: (e) => begin(e, true), onPointerMove: move, onPointerUp: end, onPointerCancel: end, onLostPointerCapture: end }, '◢'));
        }
        function ChatPane({ friend, chat, user }) {
          const avatars = useAvatars();
          const viewport = React.useRef(null), composing = React.useRef(false), stick = React.useRef(true), previous = React.useRef(null), olderAnchor = React.useRef(null);
          const measure = () => {
            const root = viewport.current;
            if (!root) return;
            const bounds = root.getBoundingClientRect();
            let upTo = 0;
            for (const node of root.querySelectorAll('[data-incoming-id]')) {
              const box = node.getBoundingClientRect();
              if (box.bottom > bounds.top && box.top < bounds.bottom) upTo = Math.max(upTo, Number(node.dataset.incomingId));
            }
            if (upTo) controller.reportVisible(friend.id, upTo);
          };
          React.useEffect(() => {
            const root = viewport.current;
            if (!root) return;
            const anchor = olderAnchor.current;
            if (anchor && !chat.loading) { root.scrollTop = root.scrollHeight - anchor.height + anchor.top; olderAnchor.current = null; }
            else if (previous.current !== chat.messages && stick.current) root.scrollTop = root.scrollHeight;
            previous.current = chat.messages;
            measure();
          }, [chat.messages, chat.loading, chat.readUpTo]);
          React.useEffect(() => {
            window.addEventListener('focus', measure); document.addEventListener('visibilitychange', measure);
            return () => { window.removeEventListener('focus', measure); document.removeEventListener('visibilitychange', measure); };
          }, [friend.id]);
          const onScroll = () => {
            const root = viewport.current;
            if (root) stick.current = root.scrollHeight - root.scrollTop - root.clientHeight < 48;
            measure();
          };
          const older = () => {
            const root = viewport.current;
            if (root) olderAnchor.current = { height: root.scrollHeight, top: root.scrollTop };
            controller.loadHistory(friend.id, chat.messages[0]?.id);
          };
          const length = [...chat.draft].length;
          return h('div', { className: 'dsf-conversation' },
            h('div', { className: 'dsf-chat-head' },
              h(Avatar, { url: avatars[friend.id], name: friend.name, status: friend.status, small: true }),
              h('div', { className: 'dsf-grow' },
                h('div', { className: 'dsf-name' }, friend.name),
                h('div', { className: 'dsf-sub' }, friend.status === 'offline' ? t('offlineChat') : friend.message || t(friend.status)))),
            h('div', { className: 'dsf-messages', ref: viewport, onScroll, onFocus: measure, role: 'log', 'aria-label': `${t('chat')} · ${friend.name}`, 'aria-live': 'polite' },
              chat.more && h('div', { className: 'dsf-row', style: { justifyContent: 'center', paddingBottom: 6 } }, h(Button, { label: chat.loading ? t('loading') : t('history'), tone: 'ghost', disabled: chat.loading, onClick: older })),
              !chat.loaded && chat.loading && h('p', { className: 'dsf-muted', style: { textAlign: 'center', padding: 12 } }, t('loading')),
              chat.loaded && !chat.messages.length && h('div', { className: 'dsf-empty' }, h('div', { className: 'dsf-empty-icon' }, h(Glyph, { name: 'chat', size: 32 })), h('p', null, t('noMessages'))),
              chat.messages.map((message) => {
                const mine = message.from === user.id;
                return h('div', { key: message.id, className: `dsf-message${mine ? ' mine' : ''}`, 'data-incoming-id': mine ? undefined : message.id },
                  h('div', { className: 'dsf-message-body' }, message.body),
                  h('time', { dateTime: new Date(message.at).toISOString() }, new Date(message.at).toLocaleString(), mine && message.id <= chat.peerRead ? ` · ${t('read')}` : ''));
              })),
            chat.error && h('div', { className: 'dsf-alert error', role: 'alert' }, chat.error,
              !chat.loaded && h(Button, { label: t('retry'), onClick: () => controller.loadHistory(friend.id) })),
            h('form', { className: 'dsf-compose', onSubmit: (event) => { event.preventDefault(); if (!composing.current) controller.sendMessage(friend.id); } },
              h('div', { className: 'dsf-compose-box' },
                h('textarea', { value: chat.draft, disabled: chat.sending, rows: 1, 'aria-label': t('chatPlaceholder'), placeholder: t('chatPlaceholder'),
                  onChange: (event) => controller.setDraft(friend.id, event.target.value), onCompositionStart: () => { composing.current = true; }, onCompositionEnd: () => { composing.current = false; },
                  onKeyDown: (event) => { if (event.key === 'Enter' && !event.shiftKey && !composing.current && !event.isComposing && !event.nativeEvent?.isComposing && event.keyCode !== 229 && event.nativeEvent?.keyCode !== 229) { event.preventDefault(); controller.sendMessage(friend.id); } } }),
                h('button', { type: 'submit', className: 'dsf-send', 'aria-label': chat.pending && !chat.sending ? t('retry') : t('sendMessage'), title: chat.pending && !chat.sending ? t('retry') : t('sendMessage'), disabled: chat.sending || !chat.draft.trim() || length > 2000 },
                  h(Glyph, { name: 'send', size: 15 }))),
              h('div', { className: 'dsf-compose-meta' },
                h('span', { className: 'dsf-faint', role: length > 2000 ? 'alert' : undefined }, chat.error ? t('messageFailed') : `${length}/2000`),
                h('span', { className: 'dsf-faint', title: t('chatPrivacy') }, t('chatHint')))));
        }
        function FloatingChats({ state, ui }) {
          const friend = state.friends.find((f) => f.id === ui.active), chat = ui.chats[ui.active];
          return h(React.Fragment, null,
            h('div', { className: 'dsf-tabs', role: 'tablist', 'aria-label': t('chats') }, ui.tabs.map((id) => {
              const person = state.friends.find((f) => f.id === id);
              return person && h('div', { key: id, className: 'dsf-tab', role: 'presentation', 'aria-selected': id === ui.active },
                h('button', { type: 'button', className: 'dsf-btn', role: 'tab', 'aria-selected': id === ui.active, onClick: () => controller.openChat(id) }, person.name, ' ', h(Unread, { count: person.unread })),
                h('button', { type: 'button', className: 'dsf-btn', 'aria-label': `${t('close')} ${person.name}`, onClick: () => controller.closeTab(id) }, '×'));
            })),
            friend && chat && state.user && h(ChatPane, { key: friend.id, friend, chat, user: state.user }));
        }
        // The float needs the same two things the management page offers before you have friends:
        // your own presence/code (to hand out) and a box to paste theirs into.
        function Toasts() {
          const toasts = useToasts();
          if (!toasts.length) return null;
          return h('div', { className: 'dsf-toasts', role: 'status', 'aria-live': 'polite' },
            toasts.map((x) => h('div', { key: x.id, className: 'dsf-toast' }, h(Icon, { size: 18 }),
              x.friendId ? h('button', { type: 'button', onClick: () => { controller.openChat(x.friendId); controller.dismissToast(x.id); } }, x.text) : h('span', null, x.text))));
        }
        function Overlay() {
          const state = useStore(), ui = React.useSyncExternalStore(controller.subscribe, controller.getUI);
          React.useEffect(() => {
            const resize = () => { for (const name of ['friends', 'chat']) controller.setWindow(name, fitWindow(controller.getUI()[name])); };
            window.addEventListener('resize', resize); return () => window.removeEventListener('resize', resize);
          }, []);
          const unread = state.friends.reduce((n, friend) => n + (friend.unread || 0), 0);
          const badge = unread + state.incoming.length;
          const online = state.friends.filter((f) => f.status !== 'offline').length;
          const note = !state.ready || !state.hasIdentity ? '' : `${online} 在线 · ${state.friends.length}`;
          return h('div', { className: 'dsf-overlay', style: { pointerEvents: 'none' } }, h('style', null, css),
            ui.friends.open && h(FloatingWindow, { name: 'friends', title: t('title'), note, rect: ui.friends },
              state.error && h('p', { className: 'dsf-alert error', role: 'alert' }, errorText(state.error)),
              !state.ready ? h('p', { className: 'dsf-muted', style: { padding: 12 } }, t('link_connecting'))
                : !state.hasIdentity ? h(Welcome, { state })
                : h(React.Fragment, null, state.user && h(Me, { state }), h(Requests, { state }), h(FriendList, { state }), h(AddFriend))),
            ui.chat.open && state.hasIdentity && h(FloatingWindow, { name: 'chat', title: t('chats'), rect: ui.chat }, h(FloatingChats, { state, ui })),
            h('button', { type: 'button', className: 'dsf-launcher', onClick: () => (ui.friends.open ? controller.setWindow('friends', { open: false }) : controller.openFriends()), 'aria-label': `${t('openFriends')}${badge ? ` · ${badge} ${t('unread')}` : ''}` },
              h(Icon, { size: 17 }), t('title'), badge > 0 && h('span', { className: 'dsf-unread' }, badge > 99 ? '99+' : badge)),
            h(Toasts));
        }

        // Footer row in the sidebar: opens the floating window in place instead of switching the
        // page, so one click on 好友 shows the list without leaving the current session.
        function SidebarEntry({ wide = true } = {}) {
          const state = useStore(), ui = React.useSyncExternalStore(controller.subscribe, controller.getUI);
          const count = state.incoming.length + state.friends.reduce((n, friend) => n + (friend.unread || 0), 0);
          return h('button', { type: 'button', className: 'dsf-foot-row', 'data-open': ui.friends.open ? '' : undefined,
            onClick: () => (ui.friends.open ? controller.setWindow('friends', { open: false }) : controller.openFriends()),
            title: t('title'), 'aria-label': `${t('title')}${count ? ` · ${count}` : ''}` },
            h('span', { className: 'dsf-foot-icon' }, h(Icon, { size: 18 })),
            wide && h('span', { className: 'dsf-foot-label' }, t('title')),
            count > 0 && h('span', { className: 'dsf-foot-badge' }, count > 99 ? '99+' : String(count)));
        }

        ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PANEL, locale: NS }, Page));
        ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({ name: 'sidebar.footer.action', id: PANEL, order: 35, locale: NS }, SidebarEntry));
        ctx.slots.inject('shell.overlay', () => ctx.slots.register({ name: 'shell.overlay', id: 'dsh-friends-toasts', order: 35, locale: NS }, Overlay));
      },
    };
  },
});
