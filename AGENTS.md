# AGENTS.md

回答、提交说明和新增代码注释使用中文。

OpenWorkMate 由员工 Web、管理后台和 NestJS + Fastify 后端组成。生产模式由后端在同一域名提供 `/`、`/admin/` 和 `/api`，MongoDB 保存平台数据。

- 使用 Node.js 22 和 package.json 固定的 pnpm 版本。
- `pnpm dev` 并行启动两个 Vite 应用和后端，开发入口为 127.0.0.1:5180。
- `pnpm build && pnpm start` 构建并启动统一服务，默认监听 127.0.0.1:18790。
- 使用 `pnpm test`、`pnpm test:e2e`、`pnpm typecheck` 和 `pnpm check:public` 验证。用户可见的 Web 改动应更新 `web-app/e2e/` 的端到端覆盖。
- 前端默认通过同源 `/api` 访问平台。外部模型凭证与业务连接器凭证由后端管理，身份与权限由后端校验。
- 更新使用流程或架构时，同步审阅 README.md、README.zh-CN.md 和 README.ja-JP.md。真实密钥、业务资料和本地数据库不能入库。
