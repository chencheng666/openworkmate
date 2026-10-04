# OpenWorkMate Backend

这是OpenWorkMate的企业后端 API，采用 **NestJS + MongoDB**。

## 技术选型

- NestJS：模块边界清晰，适合企业 API、权限、审计、后台治理。
- MongoDB：适合知识库文档元数据、知识切片、Skill manifest、审核流等半结构化数据。
- Swagger：启动后访问 `/api/docs` 查看接口。

## 启动

```bash
cd backend
cp .env.example .env
pnpm install
pnpm start:dev
```

macOS 可以通过 MongoDB 官方 Homebrew Tap 安装并注册为登录自启动服务：

```bash
brew tap mongodb/brew
brew trust mongodb/brew
brew install mongodb/brew/mongodb-community
brew services start mongodb/brew/mongodb-community
mongosh --quiet --eval 'db.runCommand({ ping: 1 })'
```

MongoDB 默认只监听 `127.0.0.1` 和 `::1`。也可以使用 Docker Compose：

```bash
cd backend
docker compose up -d mongodb
```

初始化企业演示数据：

```bash
cd backend
pnpm seed
```

`seed` 会幂等写入系统连接器、知识库、Skill 工厂、已安装 Skill 和审计记录，可重复执行。

后端启动后可运行知识库真实 API 全生命周期验证：

```bash
cd backend
pnpm smoke:knowledge
```

脚本会依次验证文件导入、异步解析和切片、园区权限隔离、知识检索、Runtime Tool 调用、编辑重建索引、归档恢复、删除和审计记录，并自动清理测试文档。

默认服务地址：

```text
http://127.0.0.1:18790/api
```

### 身份认证

本地开发默认 `AUTH_MODE=development`，兼容演示用的 `x-tenant-id`、`x-user-id` 等请求头。生产环境必须改为 `AUTH_MODE=jwt` 或 `AUTH_MODE=trusted-proxy`；除非显式设置 `AUTH_ALLOW_DEV_AUTH=true`，生产环境会拒绝开发身份请求头。JWT 请求必须携带服务端签发的 `Authorization: Bearer <token>` 或 HttpOnly 会话 Cookie；令牌至少包含 `sub`、`tenantId`、`roles`、`exp`，并由企业 SSO/OIDC 网关完成登录后签发。`AUTH_MODE=trusted-proxy` 仅适用于后端完全位于可信网关之后的部署，并要求 `x-workmate-auth-secret` 与服务端密钥一致。

`POST /api/auth/dev-login` 只在 development 模式可用，用于本地演示登录；它不能作为生产登录接口。`GET /api/auth/me` 可用于 Web 启动时验证当前会话。配置 `OIDC_ISSUER`、`OIDC_CLIENT_ID`、`OIDC_CLIENT_SECRET`、`OIDC_REDIRECT_URI` 和 `OIDC_WEB_REDIRECT_URI` 后，可通过 `GET /api/auth/oidc/start` 发起统一登录，回调会校验 OIDC Discovery、授权码、state、nonce、签名、issuer 和 audience，再签发平台内部 JWT。OIDC 的 state/nonce 会持久化到 `oidc_login_states` 集合，并由 MongoDB TTL 自动清理，支持多节点回调。

独立管理后台位于仓库根目录 `admin-web/`，默认通过 `http://localhost:5174` 访问本服务。生产部署可设置 `HOST=0.0.0.0`，并将 `CORS_ORIGIN` 限制为实际管理后台域名。

Electron 前端通过 Host API 代理访问后端：

```text
/api/enterprise/* -> http://127.0.0.1:18790/api/*
```

如需改后端地址，可在启动 Electron 前设置：

```bash
WORKMATE_BACKEND_URL=http://127.0.0.1:18790/api pnpm dev
```

## 当前模块

### Connectors

连接器用于把 OA、工单、CRM、合同、BI 等内部系统治理成可被 Skill 调用的企业系统资产。

核心集合：

- `connectors`
- `connector_confirmations`

主要接口：

- `GET /api/connectors`
- `POST /api/connectors`
- `GET /api/connectors/tool-declarations`
- `GET /api/connectors/:id/tool-declarations`
- `PATCH /api/connectors/:id/status`
- `PATCH /api/connectors/:id/http-config`：更新接入配置并重置为草稿
- `POST /api/connectors/:id/health-check`

Tool 声明会把 connector capability 转成 Gateway / MCP 适配层可消费的结构，包含：

- `name` / `description`
- `inputSchema`
- MCP-style `annotations`
- `governance`：风险等级、scope、数据域、人工确认、审计等级
- `execution`：目标连接器、能力名和运行时 transport

### Connector Runtime

Runtime 接收 Tool 声明名和输入，执行状态/风险确认门控，再分发到 Adapter 并记录审计。配置 `metadata.transport=http` 时调用真实 HTTP 接口；未配置时保留演示 mock。Skill 的角色门控与业务系统的数据授权仍需分别配置，能力声明中的 scope 本身不等于已完成业务授权。

当前 adapter：

- `OaConnectorAdapter`：OA 待办、审批动作
- `TicketingConnectorAdapter`：园区工单查询、派单
- `CrmConnectorAdapter`：招商客户画像、载体匹配、跟进任务
- `ContractConnectorAdapter`：合同读取、法务复核
- `BiConnectorAdapter`：经营指标查询、异常通知
- `GenericConnectorAdapter`：数据库、自定义或尚未专用适配的系统

工单查询 Adapter 支持在连接器 `metadata` 中配置真实 HTTP 只读调用：

```json
{
  "transport": "http",
  "searchPath": "/v1/tickets/search",
  "apiKeyEnv": "WORKMATE_TICKETING_API_KEY",
  "timeoutMs": 10000
}
```

API Key 只从后端环境变量读取，不写入浏览器或 MongoDB。接口需要返回 `items` 数组，可选返回 `total`；未配置 `transport=http` 时继续返回 mock 数据，便于本地演示。

OA、工单、CRM、合同、BI 或自定义连接器共享 HTTP 执行逻辑。`metadata.operations` 支持按能力配置独立路径、方法、请求字段映射、嵌套响应路径和业务成功码。旧查询兼容 `path` / `searchPath`，真实写入必须显式配置对应 operation。`apiKey` 使用 `x-api-key`，`jwt` 使用 `Authorization: Bearer`；凭证仅来自后端环境变量。完整配置和联调步骤见 [真实业务系统 HTTP 接入](../docs/connector-http-integration.md)。

管理后台的“健康检查”对 HTTP 连接器实际请求 `metadata.healthPath`（未配置时仅使用 `/health`，不探测业务接口），并验证服务端认证凭证；返回非 2xx、超时或连接失败标记为 `degraded/down`。演示连接器标记为 `degraded` 并说明尚未验证真实系统。HTTP 请求禁止重定向；无效配置、非 JSON 或响应不匹配不会被报告为成功空结果。

主要接口：

- `POST /api/connector-runtime/execute`
- `GET /api/connector-runtime/confirmations`
- `POST /api/connector-runtime/confirmations/:requestId/approve`
- `POST /api/connector-runtime/confirmations/:requestId/reject`

执行规则：

- 连接器不是 `active` 时直接阻断
- 只读低风险工具可按连接器配置执行查询
- 写入、审批或高风险工具没有 `confirmationToken` 时创建 `connector_confirmations` 请求并返回 `confirmation_required`
- 发起人或治理管理员确认请求后，后端返回一次性 `confirmationToken`
- Runtime 校验租户、原发起人、Tool、认证上下文、业务参数、连接器配置、状态和过期时间，并原子消费令牌；旧版未绑定摘要的确认需要重新发起
- 执行阶段通过 `ConnectorAdapterRegistry` 按 `connector.type` 选择 adapter
- 成功、阻断、调用失败都会进入 `audit_events`；失败返回 `status=failed` 和错误码，不回传上游原始异常

### Operation Demo

园区运营演示接口用于给领导快速展示“目标输入 → 知识库检索 → 工单系统查询 → 写回确认门控 → 审计留痕”的完整闭环。它复用 `KnowledgeService` 和 `ConnectorRuntimeService`，不会绕过正式 Runtime 主流程。

主要接口：

- `POST /api/operation-demo/park-operations/run`

返回内容包括执行流、知识库引用、工单查询结果、派单写回确认请求、管理价值摘要和可复制到聊天窗口的 DeepSeek 演示 prompt。

### Knowledge Hub

知识库不是直接把文档扔给模型，而是拆成可治理流程：

1. 创建知识文档元数据
2. 配置可见范围
3. 原文件写入对象存储，元数据写入 MongoDB
4. 持久化任务队列异步执行解析/切片/索引
5. 检索时按租户、角色、组织和分类过滤
6. 回答返回来源引用、命中片段和检索分数
7. 所有检索和管理动作写入审计记录

当前实现已支持演示级闭环：

- `POST /api/knowledge/documents` 可直接携带 `content` 字段，后端创建持久化索引任务并立即返回；Worker 后台写入 `knowledge_chunks`，完成后把文档置为 `ready`。
- `POST /api/knowledge/documents/import` 接收文件 Base64 内容，先写入 `KnowledgeObjectStorage` 再返回排队状态。当前本地实现落在 `KNOWLEDGE_STORAGE_DIR`，后续可替换为 MinIO/S3 adapter。
- Worker 通过 MongoDB 原子领取 `queued` 任务，依次推进 `parsing → embedding → completed/failed`；异常退出超过 5 分钟的任务会在服务启动时重新排队。
- 新索引完整写入后才清理旧切片，解析或写入失败不会提前清空原索引数据。
- 文件解析支持 PDF、DOCX、XLSX、CSV、Markdown、JSON 和文本，单文件限制为 8 MB；扫描版 PDF 需后续接入 OCR。
- `GET /api/knowledge/documents/:id` 返回文档正文和最近索引记录；`PATCH` 可更新元数据、权限和正文，正文变化时自动重新索引。
- `POST /api/knowledge/documents/:id/archive` 与 `/restore` 控制文档是否参与检索；`DELETE` 会同时清理文档、切片和索引记录。
- `POST /api/knowledge/documents/:id/ingestion-runs` 可对已有文档重新建立索引。
- `POST /api/knowledge/search` 使用本地关键词/中文 bigram 检索命中切片，返回 `answerDraft`、`citations[].snippet`、`score` 和 `highlights`，并返回 `retrieval.mode`、`retrieval.confidence`、`retrieval.vectorReady`，方便后续切换向量或混合检索时保持前端契约稳定。
- PDF 页数、Excel 工作表数和解析告警会保存在切片 metadata 中，用于后续引用定位和知识质量检查。
- `GET /api/knowledge/tool-declarations` 暴露只读低风险的 `workmate_knowledge_search` Tool 契约；`POST /api/knowledge/runtime/execute` 是智能体和 Skill 的统一执行入口，继承请求身份权限并记录调用审计。
- 文档列表、详情和检索均执行租户与可见范围过滤；修改、归档和删除仅允许创建人或平台/业务管理员执行。
- 权限范围已覆盖 `tenant` / `org` / `role` / `private`；园区权限字段保留，待接入真实身份和园区上下文后启用。

后续生产化应把 Base64 传输替换为 MinIO/S3 预签名直传，并将 MongoDB 轻量队列替换为 BullMQ/Kafka 等独立任务基础设施，同时接入 OCR 和向量数据库。

核心集合：

- `knowledge_documents`
- `knowledge_chunks`
- `knowledge_ingestion_runs`

主要接口：

- `GET /api/health`
- `POST /api/knowledge/documents`
- `POST /api/knowledge/documents/import`
- `GET /api/knowledge/documents`
- `GET /api/knowledge/documents/:id`
- `PATCH /api/knowledge/documents/:id`
- `POST /api/knowledge/documents/:id/archive`
- `POST /api/knowledge/documents/:id/restore`
- `DELETE /api/knowledge/documents/:id`
- `POST /api/knowledge/documents/:id/ingestion-runs`
- `POST /api/knowledge/search`
- `GET /api/knowledge/tool-declarations`
- `POST /api/knowledge/runtime/execute`

### Skill Factory

Skill 工厂用于让员工或部门提交业务能力，平台审核后发布到企业能力库。

核心流程：

1. 员工提交 Skill Manifest
2. 平台校验 manifest 结构和高风险规则
3. 管理员审核通过或驳回
4. 已通过 Skill 发布为 installed skill
5. 管理员启停 Skill
6. 调用、审核、发布和启停动作写审计记录

已增加 Skill Runtime 最小执行入口：`POST /api/skill-factory/runtime/execute`。它只执行已发布且启用的 Skill，校验 `governance.allowedRoleIds` 和 `inputFields`，将 manifest 中的工具映射到已启用连接器，并复用连接器的风险确认、一次性令牌和审计链路。Web 对话会把当前用户有权使用的已启用 Skill 作为模型 Tool；模型选择后由后端执行 Skill，再将结果回传模型生成最终回答。对于声明了 `outputContract.schema` 的 Skill，Runtime 会在连接器执行成功后校验结果，不符合契约时返回 `output_contract_invalid` 并写入审计。

核心集合：

- `skill_submissions`
- `installed_skills`
- `audit_events`

主要接口：

- `POST /api/skill-factory/submissions`
- `GET /api/skill-factory/submissions`
- `POST /api/skill-factory/submissions/:id/review`
- `POST /api/skill-factory/submissions/:id/publish`
- `GET /api/skill-factory/installed`
- `PATCH /api/skill-factory/installed/:id/enabled`
- `POST /api/skill-factory/runtime/execute`

### Audit

审计中心统一记录知识、Skill、连接器和 Runtime 的管理与执行动作。管理后台通过以下接口读取当前租户最近的审计事件：

- `GET /api/audit/events`
- 可选参数：`action`、`resourceType`、`result`、`limit`
- `limit` 最大为 200，结果按创建时间倒序返回

## Skill Manifest 规范

规范文件：

```text
src/modules/skill-factory/skill-manifest.schema.json
```

关键字段：

- `name`：稳定英文 ID，例如 `park-ticket-dispatch`
- `displayName`：中文展示名
- `businessDomain`：业务域
- `riskLevel`：`low` / `medium` / `high`
- `inputFields`：自然语言任务需要抽取的字段
- `tools`：Skill 需要调用的内部系统工具
- `promptTemplate`：业务规则和执行提示
- `outputContract`：输出结构
- `governance`：数据域、角色、人工确认和审计等级

高风险约束：

- 高风险 tool 必须 `confirmationRequired=true`
- `write` / `approve` 类 tool 不能使用 `humanConfirmation=never`

## 临时身份上下文

当前后端先用 HTTP headers 模拟企业身份：

```text
x-tenant-id: workmate
x-user-id: user-001
x-user-name: 张三
x-org-id: ops-center
x-role-ids: platform-admin,park-operator
x-park-ids: park-beijing-001,park-tianjin-002
```

后续应替换为企业 SSO / OA 身份认证，并把组织、岗位、园区、数据域权限接入统一权限服务。

### 知识库检索模式

默认使用中文 Bigram 关键词检索，不依赖向量数据库。配置 `KNOWLEDGE_EMBEDDING_BASE_URL`、`KNOWLEDGE_EMBEDDING_MODEL` 和可选的 `KNOWLEDGE_EMBEDDING_API_KEY` 后，文档入库和查询会调用 OpenAI 兼容的 `POST /embeddings` 接口，按关键词 60% + 向量余弦相似度 40% 进行混合排序。这样可以先在现有 MongoDB 上运行，后续再替换为 MongoDB Atlas Vector Search 或独立向量数据库。

## 下一步

1. 将当前 Base64 文件导入升级为对象存储预签名直传。
2. 将当前 MongoDB 持久队列升级为独立 Worker 集群，并接入 OCR 与向量化服务。
3. 将 connector capability 转换为 OpenClaw MCP Tool 声明。
4. 将 installed skill 转换为 OpenClaw 可安装 Skill 或 MCP Tool 声明。
5. 接入统一身份、权限、数据域和审批中心。
