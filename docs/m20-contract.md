# M20 实现契约：动作层（Action Registry → CLI + 原生工具）

> 目标：把系统全部 API/操作收敛到**一个动作目录**；对话、UI、CLI、外部调用共用同一套动作。

## 1. 原则

1. **无 UI-only 能力**：凡是界面能做的，动作层必须有等价动作；
2. **一个动作，多处调用**：UI/对话/CLI 都是客户端；
3. **动作有 Schema**：名称、描述、参数 JSON Schema、权限、风险等级、确认级别、幂等键；
4. **结果统一**：`{ok, data?, error:{code,message,recovery?}}`；文本 + `--json` 两种输出；
5. **风险分级**：R0 只读 / R1 配置 / R2 写 / R3 执行 / R4 破坏性 / R5 系统级；R3+ 需审批（沿用 M9 六步）。

## 2. 动作目录（M20 首批，覆盖现有 API）

| 命名空间 | 动作示例 |
|---|---|
| `session` | list / get / create / rename / archive / unarchive / move / pin / unpin / owner.set / delete |
| `agent` | list / get / set-owner / persona |
| `chat` | send / reply / correct / retract |
| `task` | list / get / cancel / retry |
| `workflow` | list / get / pause / resume / cancel / start |
| `schedule` | list / create / update / delete / run-now |
| `memory` | search / get / traverse / conflicts |
| `file` | list / preview / download / upload / delete |
| `permission` | get / set / approve / deny |
| `ui` | theme.set / layout.set / panel.toggle / open |
| `config` | get / set |
| `system` | health / version / stats / usage |

- 目录由后端注册表生成；每个动作映射到内部 handler（不是再包一层 HTTP）。
- `describe` 动作返回 JSON Schema，供模型与 CLI 帮助使用。

## 3. CLI

- 包名 `simo`（二进制 `simo.exe`），子命令 = 命名空间动作：
  `simo session list --json`、`simo agent set-owner --session main --agent id`、`simo ui theme set light-tech`；
- 全局参数：`--json`、`--pretty`、`--yes`（跳过确认，仅 R2 以下）、`--dry-run`；
- 退出码：0 成功 / 1 一般错误 / 2 参数错误 / 3 需要审批 / 4 被拒绝 / 5 权限不足；
- `simo actions list` / `simo actions describe <name>`；
- 密钥永不作为参数出现在命令行历史中（用 env/文件）。

## 4. 原生工具

- 动作目录同时注册为模型工具（tool name = `simo_<namespace>_<action>` 或扁平名）；
- 工具描述 = 动作描述；参数 = JSON Schema；
- 审批/审计与 CLI 一致；R3+ 必须审批，`never` fail-closed。

## 5. UI 与对话

- UI 按钮调用动作（经 HTTP 动作端点 `/api/actions/{name}`），不再直接调业务 API；
- 对话中用户自然语言 → 模型选动作 → 执行 → 自然语言汇报；
- 所有动作结果可被 UI 订阅（事件），保持界面与后端一致。

## 6. 验收（M20）

1. `simo session list --json` 与 UI 列表一致；`simo agent set-owner` 改负责人生效（UI 同步）；
2. `simo ui theme set` 改主题（对话同样可触发）；
3. 每个动作都有 Schema 与风险等级；R3+ 无审批时被拒；
4. 动作目录覆盖现有全部 API（对照清单 100%）；
5. 模型工具调用与 CLI 对同一动作行为一致（同参数同结果）；
6. 回归 M1–M19 evals 全绿 + 动作层 case。

## 7. 边界

- 不做插件/第三方动作注册（后续）；
- 不做外部 API 网关（本机 CLI/工具足够）；
- 破坏性动作默认需确认，`--yes` 也不能跳过 R4+。
