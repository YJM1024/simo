# SKILL · backend-contract

## 何时使用

- 新增/修改 API、数据模型、迁移、路径/权限契约；
- 前端需要稳定字段/错误/状态语义；
- 需要 ADR 记录重要技术决策。

不用于：纯前端视觉；无契约变化的内部重构（仍建议回归）。

## 输入

- 产品需求/AC；现有 `docs/session-core-spec.md`、`docs/session-spec.md`、`docs/workspace-layout.md`；
- 现有 API/DB/schema/迁移版本；
- 非功能约束（权限、并发、幂等、备份、兼容）。

## 步骤

1. **ADR**：问题、选项、决策、代价、回滚；重要决策一页；
2. **契约**：请求/响应/错误码/分页/幂等/权限/版本；OpenAPI 或等价摘要；
3. **数据**：表/schema/migration 版本；迁移映射、dry-run、回滚；
4. **兼容**：旧字段/旧客户端/旧数据；N/N+1 策略；
5. **安全**：认证/权限/跨会话/路径穿越/敏感字段；
6. **测试**：正常/边界/错误/并发/幂等/迁移/回滚；
7. **门禁**：契约评审 → 迁移演练 → 实现 → 联调 → 回归。

## 产物

- `specs/<CHANGE-ID>/design.md`（含 API/DB/时序/回滚）或 ADR；
- API 契约/OpenAPI 摘要；错误码表；
- 迁移脚本/计划 + 备份/对账方案；
- 测试与证据（含失败/回滚）。

## 检查表

- [ ] 请求/响应/错误码稳定且可测试；
- [ ] 权限与跨会话边界明确；
- [ ] 幂等键/并发/重试语义明确；
- [ ] schema 迁移有版本、dry-run、回滚；
- [ ] 不泄露内部路径/密钥/原始工具输出；
- [ ] 旧客户端/旧数据兼容策略；
- [ ] 正常/边界/错误/回滚测试。

## 反模式

- 先改表再补契约；无迁移版本/回滚；
- 把内部字段直接暴露给前端；
- 用 200 + 假成功掩盖错误；
- 迁移无备份/无对账；
- 只写 happy path，忽略权限/并发。

## 示例

> workspace 迁移：spec 定义旧 `data/workspace`/`data/artifacts` → 新 `workspace/main/...`；design 写复制不删除、hash 对账、失败回滚；测试覆盖路径穿越、旧数据保留、API 只读 output+user_delivery。

## 链接

- 框架：[`FRAMEWORK.md`](../../FRAMEWORK.md) §3.3
- 场景：[`SCENARIOS.md`](../../SCENARIOS.md) 数据迁移
- 相关：[`workspace-layout.md`](../../../workspace-layout.md)、[`session-spec.md`](../../../session-spec.md)
- 下游：[`testing-strategy`](../testing-strategy/SKILL.md)
