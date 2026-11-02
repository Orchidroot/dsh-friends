# DSH 好友浮窗、聊天与个人资料 · 0.8.2

DSH 内的浮动好友列表与多标签一对一文字聊天。标题可拖动、角落可缩放，可最小化或关闭；切换页面保留，重新加载重置布局。

需要另行运行好友服务（**只有 API，没有网页界面**），所有界面都在本插件的浮窗里。服务端源码和 Docker 部署文件都在[同一主仓库](https://github.com/Orchidroot/dsh-friends)，不是装完插件就自动有了服务。

## 先连接好友服务

自己部署的话，在运行服务的电脑或服务器上安装 Node.js 24+，然后执行：

```sh
npx --yes dsh-friends-service@0.8.2
```

这是[服务端 npm 包](https://www.npmjs.com/package/dsh-friends-service)，不是插件包。默认在前台运行，地址是 `http://127.0.0.1:8787`，数据保存在运行目录的 `./data`；同机 DSH 的 `serviceUrl` 填这个地址。Windows PowerShell 拦截脚本时用 `npx.cmd` 替代 `npx`。Node.js 24+ 只要求部署服务的一方安装，不要求每位插件用户另装。

给其他电脑用，需要域名和 HTTPS 反代，大家的 `serviceUrl` 填同一个 HTTPS 地址。Docker 启动命令和公网 HTTPS 配置见[完整部署说明](https://github.com/Orchidroot/dsh-friends#快速开始)及[公网部署](https://github.com/Orchidroot/dsh-friends#公网部署)。npm 命令本身不配置开机启动，也不自动开放公网。

不想自己部署，也可以把 `serviceUrl` 改为 `https://friends.150-109-84-45.nip.io`，然后重启 DSH。这是临时公共体验实例，可能停服，管理员能读取聊天；使用前请看[公共实例说明](https://github.com/Orchidroot/dsh-friends/blob/main/PUBLIC-INSTANCE.md)。不要往这里发敏感内容。

## 配置与安装

在 DSH 插件页安装该目录或 npm tarball，确认 Host 信任提示。目标 DSH `>=0.2.1-rc.5 <0.3.0`，依赖 DSH 自带 Schema、React、connection 和 credentials，不需要编译。

- serviceUrl：默认 `http://127.0.0.1:8787`，指 Host 可访问的好友服务 origin。远程必须 HTTPS，不允许路径/query/账号密码。
- autoAwayMinutes：默认 10，0 禁用自动离开。

服务数据库自动迁移，0.2.x 身份保留。升级后**必须重启 DSH** 才能加载新的 Host 代码；state RPC 的 version 应为 0.8.2，磁盘包版本不代表运行中代码已更新。0.1.x 浏览器 localStorage 身份不能自动迁移。

## 使用与隐私

侧栏底部「好友」行或右下角「好友」按钮会直接弹出浮窗，不切换 DSH 页面。个人资料可上传头像（客户端压成 96px JPEG）、写 140 字签名，并把「在线／离开／忙碌」换成自己的词条。换电脑时在「换电脑」里出码：迁移码＝搬家（旧机器退出），多端共享码＝两台同时在线（权限完全相同）。浮窗还会显示「在跑任务 / 使用中 / 空闲」（同样可自定义词条）、今日 token 用量，以及本轮任务已跑多久——依据是 DSH 会话日志最近是否在写，不读取对话内容。点击好友的聊天按钮；Enter 发送、Shift+Enter 换行，支持输入法、离线留言、未读数、新消息提醒和已读回执。每条最多 2000 个 Unicode 字符，服务器每段会话保存最近 1000 条。失败后由用户手动重试，同一次请求使用同一标识避免重复。

聊天明文保存在自部署服务器，管理员能读，不是端到端加密。删好友会连聊天一起清掉。界面上没有注销账号和忘记身份的入口，需要时直接调服务端接口。隐身只藏在线状态，主动发消息或已读回执照样会暴露你在动。

身份令牌仅在 DSH 凭据库，按服务 origin 哈希区分。浏览器只能调用 owner 鉴权的固定 RPC，不能获得令牌或指定上游 URL。不读取 DSH 会话、文件、模型或任务。

## 实现与验证

[index.js](index.js) 注册 owner 鉴权 RPC；[host.mjs](host.mjs) 管理身份/心跳/自动离开；[chat.mjs](chat.mjs) 处理消息投影与可取消长轮询；[stream.mjs](stream.mjs) 订阅 SSE 并退避重连；[client.js](client.js) 为 React-only lazy factory，注册管理页、侧栏与 overlay，使用 DSH 主题 token 和中英字典。

完整项目的 100 项自动化测试通过，含真实临时服务的双 Host 聊天、安全竞态回归和 npm 命令入口。浮窗与聊天已在 DSH 真实浏览器中核对，事件测试使用轻量 React stub，不代替视觉验收。具体已验证范围和 Docker 构建限制见[主仓库的验证说明](https://github.com/Orchidroot/dsh-friends#验证与备份)。

```sh
npm pack --ignore-scripts
```
