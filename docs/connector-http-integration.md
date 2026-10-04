# 真实业务系统 HTTP 接入

当前企业 Backend 使用 HTTP/HTTPS + JSON 调用业务系统。业务系统不必引入本平台 SDK，也不需要部署 RPA；需要提供接口文档、网络可达地址、认证凭证，以及员工和数据权限的约定。以下接口和字段仅为联调示例，需要按真实系统契约替换。

## 一份工单连接器配置

使用管理身份调用 `POST /api/connectors`，请求体如下。凭证值仅设置在后端环境变量 `WORKMATE_TICKETING_API_KEY` 中，配置内保存变量名。

```json
{
  "key": "real-ticketing",
  "displayName": "业务工单系统",
  "type": "ticketing",
  "systemName": "工单系统",
  "baseUrl": "https://ticketing.example.internal",
  "authMode": "apiKey",
  "status": "draft",
  "ownerDepartment": "运营管理部",
  "dataDomains": ["ticket"],
  "capabilities": [
    { "name": "search", "description": "查询本人可见工单", "actionKind": "read", "riskLevel": "low", "requiredScopes": [] },
    { "name": "dispatch", "description": "指定工单处理人", "actionKind": "write", "riskLevel": "high", "requiredScopes": [] }
  ],
  "metadata": {
    "transport": "http",
    "apiKeyEnv": "WORKMATE_TICKETING_API_KEY",
    "healthPath": "/health",
    "timeoutMs": 10000,
    "operations": {
      "search": {
        "path": "/api/workorders/list",
        "method": "GET",
        "queryMapping": {
          "keyword": "filters.keyword",
          "pageNo": "filters.page",
          "pageSize": "filters.pageSize",
          "employeeId": "context.userId",
          "tenantId": "context.tenantId"
        },
        "response": {
          "successPath": "code",
          "successValues": [0],
          "recordsPath": "data.records",
          "totalPath": "data.total"
        }
      },
      "dispatch": {
        "path": "/api/workorders/dispatch",
        "method": "POST",
        "bodyMapping": {
          "ticketId": "filters.ticketId",
          "assignment.userId": "payload.assigneeId",
          "operatorId": "context.userId"
        },
        "response": {
          "successPath": "code",
          "successValues": [0],
          "recordsPath": "data"
        }
      }
    }
  }
}
```

`operations` 的键必须匹配已声明能力的 `name`。提供 `operations` 后，未配置的能力直接报错，不再尝试默认接口。读取可用 GET 或 POST；写入、审批和通知需要独立能力配置，并明确指定 POST、PUT 或 PATCH。

## 参数与响应规则

- `queryMapping` / `bodyMapping` 是“目标字段 → 输入字段路径”；来源仅支持 `filters.*`、`payload.*`、`context.*`。缺失来源字段会省略，必填字段需由业务系统校验；查询数组按同名参数重复传递。
- `bodyMapping` 的目标字段支持点分嵌套，如 `assignment.userId`。未配置映射时，GET 发送 filters，其他方法发送 `{ businessGoal, filters, payload }`。确认令牌不会发往业务系统。
- `context` 来自后端认证上下文，不能被模型输入覆盖。`userId` 是否等于业务系统员工编号需要联调确认；不相同时仍需专用身份映射。传递身份不等于完成数据授权，业务系统必须校验该身份可查看或操作的数据。
- `response.recordsPath` 支持 `data.records` 等路径，也可指向单条结果对象。未配置时兼容数组或顶层 `items` / `records` / `data` 数组。未知结构、非 JSON、非对象记录均视为失败；空数组是合法成功结果。204 无正文当前不支持，需要业务接口返回 JSON 结果。
- `totalPath` 若配置则必须读到非负整数。`successPath` 与 `successValues` 必须同时配置，严格匹配类型：数字 `0` 与字符串 `"0"` 不等价。业务系统使用其他状态码时应显式配置，HTTP 200 本身不能证明业务成功。
- `apiKey` 使用 `x-api-key`，`jwt` 使用 `Authorization: Bearer`，`none` 不发送认证信息。OAuth2 自动续期、SSO 换票、自定义签名仍需专用 Adapter。
- 路径必须以 `/` 开头且与 baseUrl 同源；禁止重定向，不自动重试；超时可配置 1～60000 毫秒。超时或连接失败不代表业务系统一定没有完成写入，应先核查再发起新的确认。

## 接入验证流程

1. 创建草稿连接器并配置后端凭证环境变量。
2. 调用 `PATCH /api/connectors/:id/status`，传入 `{ "status": "active" }`。
3. 调用 `POST /api/connectors/:id/health-check`。仅请求 `healthPath`，缺省为 `/health`；健康成功代表 HTTP 连通，不代表所有业务能力均可用。
4. 调用 `GET /api/connectors/:id/tool-declarations` 获取工具名，再调用 `POST /api/connector-runtime/execute` 验证查询：

```json
{
  "toolName": "workmate_real_ticketing_search",
  "input": {
    "businessGoal": "查询空调报修工单",
    "filters": { "keyword": "空调", "page": 1, "pageSize": 20 }
  }
}
```

预期业务响应：`{ "code": 0, "data": { "records": [{ "ticketId": "TK-001" }], "total": 1 } }`。平台返回 `status=executed`、`result.mode=live`、标准化 `records` 和 `total`。

写入工具初次执行返回 `confirmation_required`。发起人或治理管理员通过 `POST /api/connector-runtime/confirmations/:requestId/approve` 确认后，将返回的 `confirmationToken` 放入**原发起人、原业务参数**的 `input` 重提。确认绑定租户、执行人、认证上下文、工具、业务参数和连接器配置，并原子消费；并发重提只允许一次执行。部署此次更新前生成的旧确认没有执行摘要，需要重新发起。

失败返回 `status=failed` 与 `error.code`，并记录 `connector_runtime.execute_failed` 审计。可能的代码包括 `invalid_config`、`missing_credentials`、`operation_not_configured`、`invalid_input`、`upstream_http_error`、`upstream_business_error`、`invalid_response`、`upstream_timeout`、`upstream_unavailable`。不向调用方回传上游原始错误正文或凭证。

## 修改已有连接器

新增 `PATCH /api/connectors/:id/http-config`，可传 `baseUrl`、`authMode`、`metadata`。仅治理管理员可更新，按租户隔离。`metadata` **整体替换**，不是深度合并；更新后连接器回到 `draft`，健康状态归零，需重新启用和验证。现有管理页面可创建基础 HTTP 配置；本轮高级能力映射通过 API 配置，尚未增加可视化编辑表单。

旧工单查询的 `searchPath`、默认分页，以及其他类型的 `path` 查询继续兼容。旧 HTTP 写入必须迁移到 `operations`；HTTP 配置缺失时不会降级为模拟执行。未配置 `transport=http` 的演示连接器保留 mock，健康检查会明确标注为演示状态。

## 自动验证

在仓库根目录执行：

```bash
pnpm vitest run tests/unit/connector-http-integration.test.ts tests/unit/connector-runtime-execution.test.ts tests/unit/connector-config-service.test.ts
pnpm --dir backend typecheck
pnpm --dir backend build
```

HTTP 集成测试启动临时本地 HTTP 服务，实际验证查询、派单、嵌套响应、业务失败、超时与重定向；不访问公司业务系统。Runtime 测试使用内存模型模拟原子条件更新，验证确认绑定和失败审计。上线前仍需使用真实接口文档、测试账号和业务数据进行联调。
