# archive/ · 归档区

> 归档时间：2026-11-14。本目录只存放**历史资料/实验资产**，不参与当前产品构建；原路径内容已移动，引用已同步更新。原始路径说明保留在下表。

## 旧路径 → 新路径

| 旧路径 | 新路径 | 归档原因 |
|---|---|---|
| `labs/` | `archive/labs/` | Storybook PoC 实验目录；非主线依赖、不作为验收门禁，且体积大（≈105MB） |
| `frontend/prototype-v3/` | `archive/prototypes/prototype-v3/` | 旧 v3 静态原型（含 review 截图）；已被当前 React 壳层取代 |
| `design/26-前端原型-v3.md` | `archive/design/26-前端原型-v3.md` | 旧原型的配套设计稿；与归档原型一并保留 |
| `research/` | `archive/research/` | 早期外部机制调研（Super-agent/Codex/DSH/Memory/SDD 等）；仅作历史参考 |

### 归档文件/目录明细

- `archive/labs/storybook/`：Storybook P1 spike、源码、配置、spike 证据；`node_modules`/`storybook-static`/`.cache`/`.home` 已加入 `.gitignore`。
- `archive/prototypes/prototype-v3/`：`index/workbench/gallery` 页面、tokens/app.css/app.js、`review/` 截图、README/REVIEW。
- `archive/design/26-前端原型-v3.md`：v3 原型设计说明。
- `archive/research/`：`adjacent-frameworks.md`、`claude-agent-sdk-mechanisms.md`、`codex-mechanisms.md`、`dsh-mechanisms.md`、`memory-first-prior-art.md`、`openspec-mechanisms.md`、`sdd-frameworks-survey.md`、`super-agent-report.md`、`superpowers-mechanisms.md`。

## 引用更新

- `.github/workflows/storybook.yml`：路径过滤、working-directory、artifact path 全部改为 `archive/labs/storybook/**`。
- `docs/process/FRAMEWORK.md`、`docs/process/research/storybook-spike.md`、`docs/tasks/STATUS.md`：Storybook 路径改为 `archive/labs/storybook/`。
- `docs/process/research/frontend.md`、`frontend/README.md`：`prototype-v3` 引用改为 `archive/prototypes/prototype-v3/`。
- `design/README.md`、`docs/dsh-alignment.md`、`docs/m21-memory-contract.md`、根 `README.md`：`research/` 引用改为 `archive/research/`。
- `archive/prototypes/prototype-v3/README.md`、`archive/design/26-前端原型-v3.md`：归档内部相对链接已修正。
- `.gitignore`：新增归档实验生成物忽略项。

## 未移动项及原因

| 路径 | 保持原位原因 |
|---|---|
| `design/`（除 26 外） | 仍是设计文档/决策台账等活跃参考，不是纯历史资产 |
| `harness/` | DSH 机制地图，仍被 `docs/dsh-alignment.md` 等当前文档引用 |
| `skeleton/` | 仍作为零依赖可运行骨架参考 |
| `frontend/prototype/` | 静态原型 v2 已冻结，作为当前视觉基线参考 |
| `docs/process/research/` | 当前 SDD 流程调研（Storybook spike 等），不是外部旧研究稿 |
| `evals/`、`deploy/`、`scripts/` | 属于当前产品/评测/交付链路 |

> 归档只整理历史资产；未改动产品代码逻辑，也未删除任何历史文件内容。
