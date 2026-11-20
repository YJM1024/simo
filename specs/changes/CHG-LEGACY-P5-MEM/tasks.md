# TASKS · CHG-LEGACY-P5-MEM

本包为 docs-only 历史归档，任务只覆盖审计、证据和文档，不包含新功能实现。

## T1 后端 API/数据/迁移盘点

- Owner：backend
- Scope：只读 `backend/internal/modules/memory/**`、`backend/internal/core/memory/**`
- AC：列出实际注册的 `/api/memory*` 路由、v1–v6 迁移和关键表；不把 debug 路由写成产品能力。
- Evidence：`backend.md` 第 2–3 节；`module.go:71-75`、`http_v3.go:13-22`、`migrations.go` 版本记录。
- 状态：done

## T2 测试映射

- Owner：backend
- Scope：只读 memory 单测与 `backend/cmd/simo/m3/m21/m22/m27/m30/m31_recall/m32` 测试
- AC：每个 PRD 至少列出实际存在的测试；无测试处写 `missing`，不得编造。
- Evidence：`test-plan.md` 测试矩阵；`evidence.md` 执行结果。
- 状态：done

## T3 全量测试执行与证据

- Owner：backend
- Scope：在 `backend/` 下执行 `go test ./... -count=1 -json`，环境变量指向 `../.tmp`；不改数据、不启动 8787。
- AC：记录命令、Go 路径、耗时、包数、测试数、失败数；失败则本包不得标 PASS。
- Evidence：`../.tmp/backend-fulltest-20261120.jsonl`；`docs/testing/BACKEND-EVIDENCE-20261120.md`。
- 状态：done（26 包 / 223 test events / 0 fail / 283.33s）

## T4 缺口与未验证项登记

- Owner：backend
- Scope：`spec.md`、`backend.md`、`evidence.md`
- AC：MEM-006、UI AC、HTTP 错误契约、迁移回滚、并发/索引等缺口逐项明确。
- Evidence：各文件“待确认/未验证”小节。
- 状态：done

## T5 验收交接

- Owner：backend → 验收 Agent
- Scope：本包文档与全量测试证据
- AC：验收 Agent 独立核对测试名、命令和状态；实现者不自签产品完成。
- Evidence：交接消息 + 本包文件清单。
- 状态：pending（等待独立验收）
