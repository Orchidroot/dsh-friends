# 公共体验实例（临时）

> **这是一台个人服务器上的临时实例，不是正式服务。** 任何人都可以用，也可以随时消失。

- 地址：`https://friends.150-109-84-45.nip.io`
- 用途：让还没自建服务的人先试一下好友浮窗、聊天和状态词条
- 性质：**尽力而为，无 SLA**。可能因为续费、迁移、重建或维护随时下线；下线不另行通知
- 数据：所有昵称、签名、状态、好友关系、**聊天明文**都保存在这台机器上，管理员（也就是这一实例的维护者）**技术上可以读取全部内容**。不要用它聊敏感、机密或涉及他人的隐私信息
- 身份：没有找回机制。机器下线、数据丢失或你忘记身份，账号就没了

## 接入步骤

1. 安装插件 `dsh-friends-plugin-<version>.tgz`（见 [主说明](./README.md#安装插件)），按提示确认 Host 信任提示
2. 把插件的 `serviceUrl` 改成 **`https://friends.150-109-84-45.nip.io`**
   - 在 DSH 的「插件」页找到 `dsh-friends`，编辑配置里的 `serviceUrl`
   - 或者直接改 profile 的 `cordis.patch.yml`：
     ```yaml
     - id: dsh-friends
       name: dsh-friends-plugin
       config:
         serviceUrl: https://friends.150-109-84-45.nip.io
     ```
3. **重启 DSH**（改配置不会热生效）
4. 打开好友浮窗，创建昵称 → 拿到好友码 → 和朋友的码互相添加

> 插件默认的 `serviceUrl` 是 `http://127.0.0.1:8787`，那是「服务跑在你自己电脑上」的默认值。不改成上面的地址，你连的就是本机，永远看不到别人。

## 如果你在意隐私

自己部署一份，见主说明的「快速启动服务 / 部署」：一台 1 核 512MB 的机器 + 一个域名就够，数据库就是单个 SQLite 文件，迁移只需要拷贝它。自建之后把 `serviceUrl` 指向自己的地址，好友也要跟着改。

## 维护者备注

- 容器 `dsh-friends`（`docker run --restart unless-stopped`），只绑 `127.0.0.1:8787`
- nginx `friends.150-109-84-45.nip.io` 反代 + certbot 自动续期（`nip.io` 把域名解析到该 IP）
- 数据在 `/home/admin/friends/data/friends.sqlite`
- 想限制注册可以给容器加 `SIGNUP_CODE=<邀请码>` 后重启，插件创建身份时会要求填写邀请码
