# 一起把企业 AI 工作伙伴做好

欢迎提交 Issue、PR、使用反馈和业务场景，不要求先成为 AI 专家。请先看 [README](README.md) 与 [路线图](docs/roadmap.md)，避免重复实现。

## 可以从哪些地方开始

1. 分享一个真实、可脱敏的企业任务：员工怎么问、当前流程怎么做、数据在哪、哪些动作需要确认。
2. 补充 OA、工单、CRM、合同等系统的 Adapter 或字段映射示例，不要提交真实地址、员工资料和凭证。
3. 改善知识检索评测、引用准确性、文档解析、版本管理和失效规则。
4. 完善连接器高级配置界面、执行轨迹、确认界面与失败恢复。
5. 提供 Docker、OIDC 和生产部署反馈，或者修复移动端、无障碍和中文体验。

## 本地开发与检查

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm ext:bridge
pnpm web:build
pnpm admin:build
pnpm --dir backend typecheck
pnpm --dir backend build
pnpm test:enterprise
pnpm check:public
```

Web UI 改动请补充 `web-app/e2e/` 中的测试；桌面 UI 改动请更新 `tests/e2e/`。通信路径改动需运行 `pnpm comms:replay` 和 `pnpm comms:compare`。不要为低影响改动编写只重复实现的测试。

新代码注释、提交说明、PR 描述优先使用中文，英文讨论同样欢迎。PR 描述请说明用户问题、改动后行为、验证结果与尚存限制。保持改动集中，不把大范围格式化混进功能修复。

## Issue 建议内容

功能建议请写清“谁、在什么场景、想完成什么事、为什么现有能力不够”，可附脱敏截图。Bug 请提供复现步骤、操作系统、Node/pnpm 版本与脱敏日志。

MIT 许可允许自由使用和修改，请保留来源声明。提交贡献意味着同意以本项目许可证发布该贡献。不要把生产密钥、公司商标素材和无授权资料提交到公开仓库。
