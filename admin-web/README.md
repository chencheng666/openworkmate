# OpenWorkMate 管理后台

`admin-web` 是独立治理网站。平台治理管理员在这里管理企业 AI 资产；员工通过 Web 或可选桌面端发起任务。请先按根目录 README 配置环境、安装依赖并初始化演示数据。

## 当前功能

- 治理总览：知识、Skill、连接器和审计数据概览，以及管理端/执行端产品边界。
- 企业知识库：文件或文本入库、分类与部门、租户/组织/角色/园区/人员权限、异步索引状态、检索验证、来源引用、编辑、归档、恢复、重建索引和删除。
- Skill 管理：提交 Manifest、风险校验、审核、驳回、发布和启停。
- 系统接入：登记 OA、工单、CRM、合同、BI 等连接器，维护能力契约、启停和健康检查。
- 新建连接器时可配置 HTTP 传输、请求方法、路径和服务端密钥环境变量名，直接对应通用 HTTP Adapter。
- 审计中心：按操作和结果查询知识、Skill、连接器及 Runtime 操作记录。

## 启动

先启动 MongoDB。如果已通过 Homebrew 安装，可使用：

```bash
brew services start mongodb/brew/mongodb-community
mongosh --quiet --eval 'db.runCommand({ ping: 1 })'
```

也可以使用 Docker：

```bash
cd backend
docker compose up -d mongodb
```

初始化数据并启动后端：

```bash
cd backend
pnpm seed
pnpm start:dev
```

再启动管理网站：

```bash
pnpm admin:dev
```

默认地址：

- 管理网站：`http://localhost:5174`
- 后端 API：`http://127.0.0.1:18790/api`
- Swagger：`http://127.0.0.1:18790/api/docs`

需要验证完整知识库链路时执行：

```bash
pnpm backend:smoke:knowledge
```

生产环境通过 `VITE_API_BASE_URL` 指向企业后端，例如：

```bash
VITE_API_BASE_URL=https://ai-api.example.com/api pnpm admin:build
```

管理后台启动后会调用 `/api/auth/me` 验证会话；配置 OIDC 后使用企业统一 SSO，开发环境才显示演示登录。生产部署必须在网关层接入 SSO，并由服务端生成可信的租户、员工、组织、角色和园区上下文。管理后台不再自行提交 `x-user-id` 等身份头，所有 API 请求通过服务端签发的 JWT 或 HttpOnly Cookie 验证。
登录后还会检查 `platform-admin` 或 `business-owner` 角色；普通员工可以登录 Web 对话，但不能进入管理后台。真正的权限判断仍由后端接口执行。
顶部账户菜单支持退出，会同时清理浏览器中的访问令牌并请求后端清除会话 Cookie。
