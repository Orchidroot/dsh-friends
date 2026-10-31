# Security Policy

## 报告问题

发现安全问题请**不要**开公开 issue。用 GitHub 的 [private security advisory](https://docs.github.com/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability) 提交，或直接联系仓库维护者。请附上复现步骤、影响范围和你使用的 DSH / Node 版本。

## 威胁模型

这个项目假设：

- **服务端不可信**：管理员能看到所有明文聊天、昵称、签名和好友关系。不要在没有端到端加密的前提下用它传输机密内容。
- **令牌即身份**：持有 256 位令牌的人可以完全操作该账号。令牌只存在本机的 DSH 凭据库里，浏览器永远拿不到它；插件通过 Host 侧的固定操作表访问服务。
- **迁移码是短期凭证**：8 位、10 分钟、一次性。`move` 模式认领即换发新令牌（旧机器失效）；`share` 模式搬运的是同一令牌的 AES-256-GCM 密文，服务端不存明文令牌。
- **公共实例是尽力而为**：见 [PUBLIC-INSTANCE.md](./PUBLIC-INSTANCE.md)，无 SLA，可能随时下线。

## 已知的边界

- 没有端到端加密：设计上就是自托管、管理员可读。
- 没有账号找回：令牌丢失即身份丢失（可用迁移码在换机前主动搬迁）。
- 多端共享后无法单独撤销其中一台：要么接受，要么两台一起换令牌。
- 服务本身只有 API：`/api/*` 与 `/healthz`，其它路径返回 404，不存在可被 XSS 利用的前端页面。

## 不要做的事

- 不要把 `DATA_DIR` 里的数据库、凭据文件或 `.tgz` 一起提交到仓库。
- 不要在公网用明文 HTTP：插件对非回环地址强制要求 `https://`，请用正式证书（Caddy / certbot）。
- 不要信任 `X-Forwarded-For`：服务端按连接来源 IP 限流，反代部署请让所有人共用代理 IP 的额度。
