# OpenWorkMate Web 对话入口

独立 Web 视图，浏览器直接访问即可对话，不依赖 Electron 桌面端。

## 本地启动

在项目根目录执行：

```bash
pnpm backend:dev
pnpm web:dev
```

浏览器打开 <http://localhost:5180>。

先按根目录 README 安装依赖、配置环境、启动 MongoDB 和初始化演示数据。默认 `WEB_CHAT_DEMO_MODE=true` 只展示检索结果，不调用模型。关闭演示后，由 NestJS 后端完成检索和 DeepSeek/兼容接口调用，浏览器不会接触 API Key。生产环境请通过 `DEEPSEEK_API_KEY` 和服务端密钥管理配置模型凭证，并为 Web 域名设置 `CORS_ORIGIN`。

Backend 只读取服务端的 `DEEPSEEK_API_KEY`，不再读取 Electron 本机 Provider 文件，Web 部署与 Electron 生命周期完全解耦。

Web 身份分为三层：开发环境兼容演示身份；生产环境推荐由企业统一 SSO/OIDC 登录后获得平台会话；后端通过 `AUTH_MODE=jwt` 验证令牌中的用户、租户、组织和角色，知识库、Skill 和连接器均不得信任浏览器自行提交的身份请求头。配置 OIDC 参数后，页面会显示“企业统一 SSO 登录”，完成回调后由后端写入 HttpOnly Cookie，Web 启动时通过 `/api/auth/me` 恢复会话；生产环境会自动加 Secure 属性。开发登录仅用于本地调试，生产环境默认拒绝。
