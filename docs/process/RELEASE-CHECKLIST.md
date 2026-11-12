# 最终发布清单 · RELEASE CHECKLIST

状态：**待用（本轮不签通过；等交付复验）**
适用：8787/容器/便携包发布；每次发布复制本清单填写，不口头放行。
关联：[`SCENARIOS.md`](SCENARIOS.md) 发布场景、[`ROLES.md`](ROLES.md) 测试/发布交接、[`COMPONENT-PARITY-GATE.md`](COMPONENT-PARITY-GATE.md)。

> **硬规则**：无 spec 不发布；无组件 parity 签字不发布；实现者不得自签；用户只验收前端效果，后端/迁移/流程由验收 Agent 签字。

## 0.1 门禁级别（Lead 裁决）

| 门禁 | 级别 | 说明 |
|---|---|---|
| `check:sdd` | **Blocking** | spec/AC/映射不通过不得发布 |
| 组件级 parity | **Blocking** | 1600/375 图 + 报告 + 验收 Agent 签字；见 [`COMPONENT-PARITY-GATE.md`](COMPONENT-PARITY-GATE.md) |
| `check:visual` 整页像素对比 | **Nightly / Warning** | **不阻断发布**；消息时间/数据动态导致 fresh capture 不稳定，不能当假门禁；结果进趋势/人工复核 |
| tsc/build/tests/evals | Blocking | 现有质量门禁 |
| smoke/rollback | Blocking | 发布前必须通过 |

> `check:visual` 的 warning 不能替代组件 parity；parity 仍必须按当前 build 重新生成并签字。

## 0. 发布元信息

| 字段 | 值 |
|---|---|
| 版本/tag | |
| 发布 owner | |
| 测试/验收 Agent | |
| 构建 buildId/commit | |
| 窗口/时区 | |
| 目标环境 | |
| 结论 | Go / No-Go（未签=No-Go） |

## 1. 范围与前置

- [ ] 本版变更清单（feat/fix/迁移/文档）完整；
- [ ] 每项变更对应已批准 spec/AC；
- [ ] 无未关闭 P0；P1/P2 有记录/豁免；
- [ ] 非目标/兼容性/已知问题已写；
- [ ] 不包含无关改动/调试文件/密钥；
- [ ] 回滚目标版本明确。

## 2. 质量门禁

- [ ] **`check:sdd` 通过（Blocking）**：spec/AC/映射；
- [ ] tsc 0 / build 通过；
- [ ] 后端测试/evals 通过（未跑项列明）；
- [ ] 前端关键交互/三态；
- [ ] 1600/1180/375 无溢出/裁切（必要时 1920）；
- [ ] console error 0、关键请求无 4xx/5xx；
- [ ] 分类/时间轴等本轮视觉项已按 spec 复验；
- [ ] `check:visual` 整页像素对比仅作 nightly/warning，记录结果但**不作为发布阻断**（动态时间/数据导致 fresh capture 不稳定）；不得用它替代组件 parity；
- [ ] 无页面定制 CSS/inline style（按项目规范）。

## 3. 组件级 parity（Blocking）

- [ ] `component-parity-1600.png` 存在且来自**当前待发布 build**；
- [ ] `component-parity-375.png` 存在且来自当前 build；
- [ ] `component-parity.md` 含基线/当前 build/逐组件判定/豁免；
- [ ] 基线=冻结原型；当前 build=待发布 build（build-id 一致）；
- [ ] 11 组件逐项：topbar/sidebar/context/chat-tabs/timeline/message-user/message-agent/card-block/composer/right-rail/statusbar；
- [ ] 允许像素微差已记录；无组件错位/风格漂移/新增颜色；
- [ ] 验收 Agent 签字；**未签=No-Go**。

> 历史签字不自动继承：build 变了就要重新生成 parity 图并重新签字。

## 4. 数据/迁移/回滚

- [ ] 迁移 spec/版本/映射明确；
- [ ] 备份完成且可恢复（hash/清单）；
- [ ] dry-run/对账通过（行数/抽样/关键查询）；
- [ ] 回滚包/命令/数据回滚步骤可用；
- [ ] 迁移期间停服/只读窗口已确认。

## 5. 包/部署

- [ ] 包/镜像可复现；SHA256/大小/构建时间记录；
- [ ] 包内无密钥/临时文件/调试开关；
- [ ] 启动脚本/健康检查/端口正确；
- [ ] 发布说明/升级说明/已知问题齐全；
- [ ] 目标环境 smoke：健康、关键 API/UI、真实数据；
- [ ] 发布后监控/日志有人看。

## 6. 签字

| 角色 | 签字 | 日期 |
|---|---|---|
| 测试 owner | | |
| 验收 Agent（后端/迁移/流程/parity） | | |
| Lead | | |
| 用户（仅前端效果） | | |

- 实现者/作者不得自签；
- 用户签字仅覆盖前端视觉/交互，不替代后端/迁移/流程签字；
- 任一 Blocking 未过 → No-Go，不部署。

## 7. 发布后

- [ ] 线上 build-id 与发布包一致；
- [ ] 健康/关键路径/console 回归；
- [ ] 证据归档（本清单、parity、测试、截图、hash）；
- [ ] 若回滚：记录原因/时间/影响。

---

*本清单是模板，不代表当前版本已通过；本轮状态=待交付复验，不签通过。*
