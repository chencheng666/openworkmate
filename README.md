# OpenWorkMate

面向企业内部的开源 AI 工作伙伴。员工用浏览器查制度、看原文引用和调用已授权的业务能力。管理员管理资料、Skill、系统连接与审计。

员工端和管理后台共用配色与品牌图标，手机上可按需打开导航。对话 Markdown 渲染器和管理子页按需加载。

平台管理员可在 **管理后台 → 企业外观** 设置当前企业的名称、PNG 图标和科技配色。预览不影响线上外观，保存后员工刷新即可看到。配置来自登录身份中的租户，不跨公司复用；未登录使用默认品牌。

回答支持 Markdown、图片和视频链接预览、表格导出 CSV、整条回答导出 Markdown。含 2–12 行的“类别＋非负数值”两列表格还能在本地生成并下载 SVG 柱状图。视频和外部图片在用户点开后才加载；当前不会调用文生图或文生视频服务。

## 快速开始

需要 Node.js 22、pnpm 10.31.0 和 MongoDB 7+。

```bash
git clone https://github.com/chencheng666/openworkmate.git
cd openworkmate
corepack enable
pnpm install --frozen-lockfile
cp backend/.env.example backend/.env
docker compose -f backend/docker-compose.yml up -d
pnpm backend:seed
pnpm dev
```

已有本地 MongoDB 时可跳过 Docker 步骤，通过 `backend/.env` 设置 `MONGODB_URI`。运行 `backend:seed` 会写入演示资料、Skill 和连接器，请使用专用演示数据库。

- 员工对话访问 [127.0.0.1:5180](http://127.0.0.1:5180/)。
- 管理后台访问 [127.0.0.1:5180/admin/](http://127.0.0.1:5180/admin/)。
- 试问“园区报修超过 24 小时未响应怎么办”，查看命中的示例制度片段。
- 管理工作台可直接打开上传知识或接入系统表单。只读 HTTP 连接器默认填写系统名称和完整查询地址，认证、请求方法与其他字段在高级配置中。连接器先保存为草稿。

演示模式使用样例数据和开发身份，适用于本地体验。要使用模型，在 `backend/.env` 设置 `WEB_CHAT_DEMO_MODE=false` 并填入 `DEEPSEEK_API_KEY`，重启即可。兼容接口可调整 `DEEPSEEK_BASE_URL` 和 `DEEPSEEK_MODEL`。界面从服务端读取演示状态。

## 构建与部署

本地接 OpenAI：为项目创建只允许 Chat Completions 和 Embeddings 的 Key。在 macOS 上复制 Key 后，于项目根目录执行 `pbpaste | node scripts/configure-openai.mjs`，然后清空剪贴板并重启。其他系统可经标准输入传入，不要把密钥写在命令行参数里。脚本只新建 Git 忽略且仅当前用户可读写的 `backend/.env.openai.local`，不覆盖旧文件。外部环境变量优先于配置文件；不要同时强设演示模式。真实问答与索引会把问题及必要的知识片段发给配置的模型服务，请先用公开样例并检查服务地区、权限和预算。

配置向量模型后，前往知识库为已有资料重新建立索引。旧版没有模型标识的向量、不同模型的向量不混算。查询端嵌入不可用时退回关键词，响应的 `retrieval.degraded` 表示降级；入库失败会保留错误状态，不能把失败算成已向量化。

```bash
pnpm build
pnpm start
```

NestJS 服务默认监听 127.0.0.1:18790，同时提供员工端 `/`、管理端 `/admin/` 和 API `/api`。部署时保留 `web-app/dist`、`admin-web/dist` 和 `backend/dist` 的工作区布局。生产配置使用 HTTPS、JWT/OIDC 或可信网关、有效凭证和持久化存储。配置 `NODE_ENV=production`、`AUTH_MODE=jwt`（或 `trusted-proxy`）、`WEB_CHAT_DEMO_MODE=false`，按实际域名设置 OIDC 回调和登录后跳转地址。配置细节见 [后端文档](backend/README.md)。

## 架构

```text
浏览器  / 员工对话  ·  /admin/ 管理后台
                       ↓ 同源 /api
            NestJS + Fastify 模块化服务
           ↙           ↓             ↘
    MongoDB + 解析    模型调用      HTTP 业务系统
```

知识入库、检索、Skill 执行、写入确认与审计由后端模块处理。默认中文 Bigram 检索，可选 Embedding 混合排序。会话保存在页面内存；通过「文件结果」生成的 Markdown、CSV、PNG 摘要卡和 MP4 简报在服务端保存 7 天，刷新后仍可预览、下载。图片与视频是本地排版和编码，不收费调用生成式模型。

macOS 可选 Tauri 2 桌面端：先启动本地后端，再运行 `pnpm desktop` 生成并启动应用。支持全局 ⌘⇧空格唤起、选择目录和防覆盖保存；没有将模型密钥打包进客户端。纯 Web 使用者不需要安装 Rust。

[架构说明](docs/architecture.md) · [HTTP 接入示例](docs/connector-http-integration.md) · [迭代路线图](docs/roadmap.md)

[本地验证与 Tauri 桌面端设计](docs/local-workspace.md)

## 验证与贡献

```bash
pnpm test
pnpm exec playwright install chromium
pnpm test:e2e
pnpm build
pnpm check:public
```

[贡献指南](CONTRIBUTING.md) · [CI 模板](docs/ci/enterprise-check.yml) · [安全反馈](SECURITY.md) · [社区讨论](https://github.com/chencheng666/openworkmate/discussions)

[早期开源介绍与截图](https://github.com/chencheng666/openworkmate/blob/v0.1.0-alpha.1/docs/wechat-article.md)记录了首个预览版。项目使用 GPT‑6 辅助开发，保留历史来源与原版权声明。[许可与致谢](NOTICE.md)
