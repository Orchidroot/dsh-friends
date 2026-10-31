# 公共体验实例（临时）

这台机器是我自己的服务器，拿来给还没部署服务的人试用。它随时可能关掉。

- 地址：`https://friends.150-109-84-45.nip.io`
- 随时可能下线，不提前通知。别把它当正式服务用
- 所有昵称、签名、状态、好友关系和聊天内容都存在这台机器上，我能看到全部。别拿它聊不能给第三个人看的东西
- 账号没有找回。机器没了、数据没了、或者你忘了身份，就都没了

## 接入

1. 装插件：`dsh-friends-plugin-<version>.tgz`（见 [主说明](./README.md#安装插件)）
2. 把插件的 `serviceUrl` 改成 `https://friends.150-109-84-45.nip.io`
   - 在 DSH 的「插件」页找到 `dsh-friends`，改配置里的 `serviceUrl`
   - 或者直接改 profile 的 `cordis.patch.yml`：
     ```yaml
     - id: dsh-friends
       name: dsh-friends-plugin
       config:
         serviceUrl: https://friends.150-109-84-45.nip.io
     ```
3. 重启 DSH。改配置不会热生效
4. 打开好友浮窗，创建昵称，拿到好友码，和朋友互相加一下

插件默认的 `serviceUrl` 是 `http://127.0.0.1:8787`。那是「服务跑在自己电脑上」用的默认值，不改的话你连的是本机，看不到任何人。

## 不想把聊天放在我这儿

自己部署一份。一台 1 核 512MB 的机器、一个域名就够，数据就是一个 SQLite 文件。部署见主说明，装好之后把 `serviceUrl` 指向自己的地址，好友也要改。
