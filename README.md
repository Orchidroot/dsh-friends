# DSH Friends · 好友浮窗、聊天与个人资料 0.8.2

DSH 插件，加一个自己部署的好友服务。装完 DSH 里会多一个浮窗式的好友列表，能看谁在线、在干什么，也能聊天。

插件默认连本机 `http://127.0.0.1:8787`，那是"服务跑在自己电脑上"用的。不改这个地址，你只能看到自己。

两种用法：

- **先用现成的**：把 `serviceUrl` 改成 `https://friends.150-109-84-45.nip.io`，重启 DSH。这是我自己机器上的临时实例，随时会关，聊天内容我也看得到，细节写在这里：[公共体验实例](./PUBLIC-INSTANCE.md)
- **自己部署**：照下面「启动服务」做一份，`serviceUrl` 指向你的域名。好友也要填同一个地址

## 界面

![好友浮窗](docs/float.jpg)

![资料与词条](docs/profile.jpg)

浮窗默认在右下角，能拖、能缩放、能最小化。「资料与好友码」里换头像、写签名、改状态词条、出迁移码。

## 快速开始

### 用公共实例

1. 装插件（见「安装插件」）
2. 插件配置里把 `serviceUrl` 改成 `https://friends.150-109-84-45.nip.io`
3. 重启 DSH。打开浮窗，创建身份，拿到好友码，和朋友互相加

### npm 启动（Node.js 24+）

包名是 `dsh-friends-service`，装的是服务端，不是 DSH 插件。不需要 Docker，也不需要下载源码。

先装 Node.js 24 或更高版本，下面的命令用自带的 npm/npx 运行。Windows PowerShell 如果提示禁止运行脚本，把 `npm` 换成 `npm.cmd`、`npx` 换成 `npx.cmd` 即可，不用修改系统执行策略。

不全局安装，直接启动：

```sh
npx --yes dsh-friends-service@0.8.2
```

也可以全局安装，以后直接运行命令：

```sh
npm install --global dsh-friends-service@0.8.2
dsh-friends-service --data-dir ./friends-data
```

默认监听 `http://127.0.0.1:8787`，插件的 `serviceUrl` 填这个地址。命令在前台运行，Ctrl+C 停止；不会自动配置开机启动或公网 HTTPS。

数据默认在**运行命令时所在目录**的 `./data`，不在 npm 安装目录或 npx 缓存里；上面的全局安装示例改用了 `./friends-data`。每次都要用同一个数据目录，服务器上建议用 `--data-dir` 指定绝对路径；更新或清理 npx 缓存不会删数据。

`--port 8787`、`--host 127.0.0.1`、`--data-dir ./friends-data`、`--public-origin https://friends.example.com` 都能按需设置，也可以继续用环境变量；命令行参数优先。全部参数可运行 `dsh-friends-service --help` 查看。远程访问仍需要 HTTPS 反代，不能只把 `--host` 改成 `0.0.0.0` 就当作公网部署。

### 一键部署（Docker）

先装好 Git、Docker 和 Docker Compose 插件，并启动 Docker。下面这条在 Bash 里运行，从拉取源码到后台启动一起完成，不用另装 Node.js；当前目录下不能已有 `dsh-friends` 文件夹：

```sh
git clone https://github.com/Orchidroot/dsh-friends.git && cd dsh-friends && docker compose up -d --build
```

这会启动本机服务，插件的 `serviceUrl` 填 `http://127.0.0.1:8787`。容器会随 Docker 启动，数据保存在 Docker 命名卷里。**只跑这条不会开放公网**；给其他电脑用，接着看下面「公网部署」。

不用 Docker 的话，先装 Node.js 24+，克隆仓库后在仓库目录运行 `npm start`。

## 使用

侧栏底部的「好友」行和右下角的「好友」按钮，都是直接弹出浮窗，不切换 DSH 页面。标题栏拖动，右下角 ◢ 缩放，可最小化；切换 DSH 会话不影响，重新加载页面重置布局。点击好友的聊天按钮；Enter 发送，Shift+Enter 换行，输入法选字不误发送。

个人资料里可以换头像（客户端先压成 96px JPEG，好友按需拉取，不进轮询）、写 140 字签名，也能把「在线」这类词换成自己的说法。

换电脑或多端登录，都在「资料与好友码 → 换电脑」里出码，新机器在欢迎页输入。两种码：

- **迁移码**：认领时服务端换发新令牌，旧机器立即退出登录（真正搬家）。
- **多端共享码**：服务端只存一份用码派生的 AES-GCM 密文，认领后两台持有同一个令牌、同时在线；代价是两台权限完全相同，不能单独撤销其中一台。

两者都是 8 位、10 分钟有效、只能用一次；共享码认领后立即删除，数据库里没有可复用的令牌。

「在跑任务」是看 DSH 有没有在写会话日志判断的，另外还有「使用中」和「空闲」，这三个词都能改。浮窗里顺手显示今天的 token 用量和调用次数，数来自 DSH 自己的用量账本；跑任务时会实时算这一轮跑了多久。

一对一聊天支持离线留言、历史分页、未读数、新消息提醒及已读回执。每条最多 2000 个 Unicode 字符，每段会话保留最近 1000 条。失败保留草稿，由用户手动重试，同一次重试携带相同 clientId 避免重复。

**删除好友永久清除双方聊天。** 界面上没有「注销账号 / 忘记身份」入口（需要时可直接调服务端 API）；令牌没有找回机制，换机器请用下面的迁移码。

保留好友码申请/确认、拒绝/撤回、昵称搜索、在线/离开/忙碌/隐身、签名、最后在线、自动离开和上线提醒。令牌存于 DSH 凭据库，不发给浏览器，不读取 DSH 会话、文件、模型或任务。

## 隐私

聊天明文存于自部署服务器的 SQLite，管理员可读取，**不是端到端加密**。只有已确认好友可访问双方会话，第三位好友不能收取消息事件或读取历史。已读仅在聊天活动、页面可见且有焦点、入站消息实际显示在聊天视口时提交。

隐身只隐藏在线状态和签名，**主动发送消息或已读回执仍可能透露活动**。

## 启动服务

需要 Node.js **24+**，无 npm 依赖：

```sh
npm start
```

默认只监听 `http://127.0.0.1:8787`，数据在 `./data`。SQLite experimental warning 不代表失败。**服务只提供 API，没有网页界面**（早期版本自带过一个只支持好友/状态的网页，已移除）；除 `/api/*` 与 `/healthz` 之外的路径一律返回 404 JSON。所有界面都在 DSH 插件里。

0.2.x 数据库自动加表/列，身份和好友保留。升级前停服务，备份整个 DATA_DIR。0.1.x 曾使用浏览器身份，不能自动迁移到 DSH 凭据库。

## 安装插件

安装 `plugin` 目录或 `dsh-friends-plugin-0.8.2.tgz`，不要安装项目根目录（它是服务端）。确认 Host 信任提示；插件在 DSH 进程内运行。目标 DSH `>=0.2.1-rc.5 <0.3.0`，使用自带 Schema 与 React，无前端构建步骤。

serviceUrl 默认 `http://127.0.0.1:8787`，指 Host 所在机器可访问的服务 origin。改成别人的服务就填对方的 HTTPS 域名；改完必须重启 DSH 才生效（在 DSH「插件」页编辑，或改 profile 的 `cordis.patch.yml`）。远程必须 HTTPS，禁止路径、query、账号密码、跳转。autoAwayMinutes 默认 10，0 关闭自动离开。

升级后按 DSH 提示刷新或重启。**磁盘版本不代表运行 Host 版本**，state RPC 的 version 应为 0.8.2。身份按服务 origin 哈希，存在 ctx.credentials grant 记录，跨端口变化/刷新/Host 重启保留；换电脑或 origin 不自动同步。**插件更新后 Host 侧代码需要重启 DSH 才生效**（只换了磁盘上的包、没重启，运行的还是旧 Host 代码）。

```sh
cd plugin
npm pack --ignore-scripts
```

## 插件市场

社区市场 dshmarket 的目录来自 [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)。收录申请按它的 [贡献指南](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/main/contributing.md) 提交，只需增加一个插件条目文件。审核通过后才会上架。

可安装的插件包在 [dsh-friends-plugin](https://github.com/Orchidroot/dsh-friends-plugin)，本仓库保留服务端、测试和完整源码。

另外提供一个自定义索引，供启用了 DSH 原生「发现」索引功能的人使用，不等于社区市场已收录：

https://raw.githubusercontent.com/Orchidroot/dsh-friends/main/docs/market-index.json

维护时运行 `bash tools/publish-plugin.sh` 同步插件仓库和索引，再提交并推送本仓库。

## 实时链路与权限

浏览器调用 owner 鉴权的 `/api/dsh-friends.rpc` 固定操作表，不能指定上游路径或获取令牌。Host 15 秒心跳，SSE 接收好友/消息变化，浏览器通过最多 20 秒的可取消长轮询即时更新；SSE 断线退避重连，保留 5 秒/60 秒快照轮询兜底，事件缺口用历史游标补取。

聊天 API：`GET/POST /api/chats/:friendId` 和 `POST /api/chats/:friendId/read`，历史支持 before/after id 分页。写事务内再次检查好友关系，防止慢上传时权限已被撤销；旧 HTTP 响应不得覆盖新的 SSE/本地消息状态。服务端只存令牌摘要，不开放 CORS，不应公开 DSH 管理端口。

## 公网部署

适合一台 Linux 服务器。先按上面的一键部署拉取并启动服务，然后：

- 把自己的域名（例如 `friends.example.com`）解析到服务器的公网 IP；有 AAAA 记录的话，也要指向这台服务器。
- 在服务器防火墙和云平台安全组放行 TCP 80、443，保证这两个端口没有被其他程序占用；不用开放 8787。
- 在刚才的 `dsh-friends` 目录里，把下面的域名换成自己的，再整段复制到 Bash 运行。会生成 `.env` 和 `compose.override.yaml`；已有这两个文件时会停止，避免覆盖配置。

```sh
(
  set -eu
  DOMAIN=friends.example.com
  test ! -e .env && test ! -e compose.override.yaml || {
    echo 'Existing .env or compose.override.yaml; merge configuration manually.' >&2
    exit 1
  }
  printf 'PUBLIC_ORIGIN=https://%s\nFRIENDS_DOMAIN=%s\n' "$DOMAIN" "$DOMAIN" > .env
  cat > compose.override.yaml <<'YAML'
services:
  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    depends_on:
      - friends
    ports:
      - "80:80"
      - "443:443"
    command: ["caddy", "reverse-proxy", "--from", "${FRIENDS_DOMAIN:?Set FRIENDS_DOMAIN}", "--to", "friends:8787"]
    volumes:
      - caddy-data:/data
      - caddy-config:/config
volumes:
  caddy-data:
  caddy-config:
YAML
  docker compose up -d --build
)
```

Caddy 会申请和续期 HTTPS 证书；首次启动需要等域名验证完成。已有 nginx/Caddy 的服务器不用启动这里的 Caddy 容器，直接反代到 `127.0.0.1:8787`，并在 `.env` 写入 `PUBLIC_ORIGIN=https://你的域名`，再运行 `docker compose up -d --build`。

部署好后，自己和好友的 `serviceUrl` 都填 `https://你的域名`，然后重启 DSH。服务没有网页首页，检查是否启动请访问 `https://你的域名/healthz`。看启动日志用 `docker compose logs --tail=100 friends caddy`。

日后更新，在仓库目录运行 `git pull --ff-only && docker compose up -d --build`。更新前先停服务并备份数据卷；普通 `docker compose down` 不会删除数据，**不要加 `-v`**，那会连数据库和证书卷一起删掉。

## 部署与限制

[Compose](compose.yaml) 使用非 root 服务容器，只发布本机回环端口；数据放在命名卷里，配置了 `restart: unless-stopped`。服务器重启后自动恢复还需要 Docker 服务本身开机启动。公网可用上面的 Caddy，也可自行配置 nginx；可用 SIGNUP_CODE 限制注册，不设置则开放注册。

环境变量：HOST（127.0.0.1）、PORT（8787）、DATA_DIR（./data）、PUBLIC_ORIGIN、SIGNUP_CODE、REGISTER_LIMIT_HOUR（100）、IP_LIMIT_MINUTE（10000）、IDENTITY_LIMIT_MINUTE（300）。默认每身份每分钟 60 条聊天；最多 500 好友、100 待处理申请、20 租约和 5 条 SSE。全服最多 10000 身份，单进程 SQLite，不支持多实例共享在线状态。不信任 X-Forwarded-For，反代用户共享出口 IP 额度。

多设备状态取在线 > 忙碌 > 离开，隐藏设备不覆盖可见设备。隐身活动不更新最后在线。卸载尽力释放租约，失败时约 45 秒自然离线；凭据保留可重装继续使用。

## 验证与备份

```sh
npm test
npm run check
```

当前 100 项自动化测试通过，包括 npm 命令入口与参数校验、临时服务启动和关闭、真实服务与双 Host 实时聊天、好友撤销和慢请求竞态、幂等重试、未读乱序、长轮询取消及已有隐私/身份回归。npm 上的 `dsh-friends-service@0.8.2` 已用空缓存下载安装，并验证命令入口和 `/healthz`；验证只使用临时目录和测试数据库。其中浮窗事件测试使用轻量 React stub（不是 DOM 视觉验收）。已在当前 DSH 实测：侧栏点开即浮窗（不切页面）、拖动/缩放/最小化、实时收发、未读徽标与提醒、已读回执、刷新后历史恢复、头像与状态词条、多端共享码，均经真实浏览器核对；DSH 重启后 Host 代码更新也已验证。公网部署（Docker + nginx + certbot）已在一台 Ubuntu 24.04 上跑通注册、加好友、发消息、SSE 与迁移码。项目自带的 Dockerfile 与 compose 配置尚未实际构建（线上实例是直接用 `node:24-alpine` 镜像跑 `server/main.mjs`）。

备份前停服务，备份整个 DATA_DIR；数据库包含本插件聊天，不包含 DSH 会话。源码 ZIP 排除数据库、凭据和 node_modules。

许可：[MIT](./LICENSE) · 安全策略与威胁模型：[SECURITY.md](./SECURITY.md) · 公共实例条款：[PUBLIC-INSTANCE.md](./PUBLIC-INSTANCE.md)

源码：[服务端](server/service.mjs) · [Host](plugin/host.mjs) · [聊天缓冲](plugin/chat.mjs) · [实时订阅](plugin/stream.mjs) · [界面](plugin/client.js) · [插件说明](plugin/README.md)。
