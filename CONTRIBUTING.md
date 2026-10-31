# 贡献指南

感谢你愿意改进这个项目。它由两部分组成，改动前先弄清楚改的是哪一半：

| 目录 | 说明 | 是否需要重启 DSH |
| --- | --- | --- |
| `plugin/` | DSH 插件（Host 逻辑 + 浏览器界面） | **是**（Host 代码只在启动时加载） |
| `server/` | 好友服务（纯 API） | 重启服务进程即可 |
| `test/` | 自动化测试（Node 内置 test runner） | 否 |

## 开发循环

```sh
npm test        # 85 项：服务端、Host、界面渲染、安全回归
npm run check   # 语法检查
```

改 `plugin/` 后本地验证：

1. `cd plugin && npm pack --ignore-scripts --pack-destination ..`
2. 在 DSH 插件页安装生成的 `.tgz`（或 `dsh plugin add file:...`）
3. **重启 DSH**，否则运行的还是旧 Host 代码
4. 打开好友浮窗自测；涉及两台机器的行为，用两个独立 DSH 配置目录最稳

## 代码约定

- 服务端只用 Node 内置模块（`node:http`、`node:sqlite`），不引入第三方依赖；SQLite 迁移必须是可重复执行、幂等的
- 浏览器侧只 `require('react')`，不引入 DSH 内部模块；样式只用 `--dsw-alias-*` 主题变量，保证明暗主题都能看
- 所有对外输入都当成不可信：长度、字符集、类型逐项校验；错误信息不回显内部细节
- 涉及权限的写入要在**同一个事务里**再校验一次关系（参考 `server/service.mjs` 的 `related()` 用法）
- 新行为请配测试：能复现 bug 的测试优先于描述性测试

## 提交前

- `npm test` 与 `npm run check` 全绿
- 不要在提交里带 `data/`、`*.sqlite`、凭据文件、`*.tgz`、`*.zip`
- 修改协议/接口时同步更新 `README.md` 与 `SECURITY.md` 里的威胁模型

## 报告问题

功能缺陷请开 issue，附 DSH 版本、Node 版本和复现步骤。**安全问题不要开公开 issue**，见 [SECURITY.md](./SECURITY.md)。
