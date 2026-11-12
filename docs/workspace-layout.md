# Workspace 目录规范

状态：spec draft（用户已确认目录结构；仅文档，不改代码）
适用范围：`SIMO_HOME/workspace/` 的会话工作区、规格、临时区、交付物 API、迁移与备份。
关联：`docs/session-spec.md`、`docs/session-core-spec.md`、`docs/tasks/product.md`、`docs/admin-guide.md`。

---

## 1. 总览

```text
SIMO_HOME/
└── workspace/                         # 唯一工作区根
    ├── main/                          # 主会话工作区（固定根，不可重命名）
    │   ├── code/
    │   ├── data/
    │   ├── output/                    # 用户交付物（API 唯一暴露）
    │   ├── tasks/                     # 任务工作目录/暂存
    │   ├── _internal/                 # 审计/索引/提升记录（不对外）
    │   └── conversations/             # 子会话，递归同构
    │       └── <slug>-<shortId>/
    │           ├── code/
    │           ├── data/
    │           ├── output/
    │           ├── tasks/
    │           ├── _internal/
    │           └── conversations/...
    ├── specs/                         # 与 main 同级；规格树
    │   ├── main/
    │   │   ├── spec.md
    │   │   └── conversations/
    │   │       └── <slug>-<shortId>/...
    └── work/                          # 临时/中间产物；与 session 树同构
        ├── main/
        │   ├── tasks/
        │   ├── tmp/
        │   └── conversations/...
        └── ...
```

规则：

- `main` 是唯一主会话根，固定路径 `workspace/main`，不可删除/重命名；
- 子会话目录挂在父节点的 `conversations/` 下，**递归同构**；子会话路径一旦创建不随显示标题变化；
- `specs` 与 `main` 同级；`specs/main` 保存主会话规格，子会话在 `specs/main/conversations/<slug>-<shortId>/...` 递归镜像；
- `work` 与 session 树同构，但只放临时/中间产物，**不属于交付物**；
- 所有路径都相对 `SIMO_HOME/workspace/` 解析；禁止绝对路径/`..`/盘符/UNC/符号链接穿越。

---

## 2. 三类目录边界（硬规则）

| 目录 | 放什么 | 是否用户交付物 | API 可见 |
|---|---|---|---|
| `output/` | 用户最终交付物（文档、图片、导出的 PDF 等） | **是** | **是**（只读） |
| `_internal/` | 审计、提升记录、索引、清单、迁移/清理日志 | 否 | 否 |
| `work/` | 临时/中间产物、任务 staging、失败保留 | 否 | 否 |
| `tasks/` | 任务执行的工作目录/暂存；完成前不是交付物 | 完成提升后才有 | 否（只能经提升进 output） |
| `code/` | 任务/会话产生的代码/脚本工作区 | 默认否（除非显式提升） | 否 |
| `data/` | 输入、附件、工作数据、引用材料 | 否（用户原始材料由 input 入口管理） | 否 |
| `specs/` | SessionSpec 的持久化副本/规格文档 | 否 | 通过 Spec 只读入口，不通过交付物 API |

**边界判断**：

- 只有 `output/` 下、且带 `user_delivery:true` 的记录，才进入交付物 API；
- `_internal/` 永不作为交付物；审计日志不得被 API 直接读取；
- `work/` 可被任务读写，但**不会**出现在文件页/交付物页；任务结束也不自动成为交付物；
- `tasks/`/`code/`/`data/` 的输出需显式“提升”到 `output/`，否则留在工作区，不对外。

---

## 3. 任务完成与提升规则

### 3.1 正常流程

1. 任务开始时在 `main/<session>/tasks/<taskId>/`（或 `work/<session>/tasks/<taskId>/`）创建 staging；
2. 任务把中间结果写入 staging；**不得直接写 `output/`**；
3. 任务声明交付物清单：`user_delivery: true` 的文件/目录 + 展示名/类型；
4. 任务进入终态 `done` 后，由提升器执行：
   - 校验来源在任务 staging 内、目标在 `output/` 内；
   - 复制/重命名到 `output/<稳定路径>`；同内容幂等，内容不同生成 `-v2`，不覆盖旧交付物；
   - 写入 `_internal/promotions/<taskId>.json`（来源、目标、sha256、时间、taskId、revision）；
   - 提升完成后交付物 API 才可见；
5. 任务失败/取消：**不提升**；staging 保留在 `work/` 或 `tasks/`，供诊断/重试。

### 3.2 原子性/幂等

- 提升先在目标同文件系统的临时路径完成，再原子 rename；部分失败不得留下“半个交付物”；
- 同一 taskId + 同内容重复提升 → 幂等（hash 相同，返回原记录）；
- 同一目标路径不同内容 → 新版本 `-v2`/`-v3`，旧文件保留；不删除用户已有交付物；
- 提升记录是审计事实；API 只读 `output` 中实际存在且 manifest 标记 `user_delivery` 的条目。

### 3.3 什么时候不算提升

- 只写 `_internal/`、`work/`、`tasks/`、`code/`、`data/` 不自动提升；
- 任务过程中的临时导出/截图默认留在 work；只有任务清单显式声明的才提升；
- 会话归档不改变 output 的访问规则；重命名会话不移动 output 路径。

---

## 4. `work/` 清理与 TTL

| 内容 | 默认保留 | 清理规则 |
|---|---|---|
| 成功任务的 `work/` staging | 7 天 | 任务结束 7 天后可清理；先写 `_internal/cleanup` 记录 |
| 失败/取消任务 | 30 天 | 保留供诊断；30 天后可清理，不删 output |
| 运行中任务 | 不清理 | 有 active task/锁时跳过 |
| `_internal/` 审计 | 180 天（可配置） | 只归档/压缩，不参与交付物 API |
| `output/` / `specs/` | 不自动清理 | 只能用户/归档策略处理 |

规则：

- 清理只作用于 `work/`（必要时 `tasks/` 的过期 staging）；**绝不删除 output/specs/_internal 审计原文**；
- 清理前检查 no-running-task、无 `.keep`/诊断标记；
- 删除必须 canonical 路径在 `workspace/work/` 根内，禁止跟随 symlink/junction；
- 失败任务的 work 默认保留 30 天；用户可手动“保留/立即清理”，清理也记录审计；
- TTL 可配置；文档默认值待后端常量确认，不在代码/页面写死。

---

## 5. 命名规则（slug + shortId）

- 会话目录：`<slug>-<shortId>`，例如 `conversation-panel-a1b2c3d4`；
- `slug`：由标题生成，小写 ASCII kebab-case；中文/空标题回退 `session`；最长 32；
- `shortId`：创建时生成的稳定短 id（建议 8 位小写十六进制/Base36）；全局/同父唯一；
- 路径在创建后**不随标题重命名而改变**；显示名可改，路径/shortId 不变；
- 同级冲突：追加 `-2`/`-3` 或更长 shortId，保证唯一；禁止用标题直接拼路径；
- 任务目录：`tasks/task-<shortId>/`；提升目标保留原相对文件名，冲突时加版本后缀；
- `main` 固定，不加 slug/shortId；`specs/main`、`work/main` 同样固定。

---

## 6. 交付物 API（只读 + 权限过滤）

### 6.1 可见范围

- 只返回 `workspace/main/<session>/output/` 下、manifest `user_delivery:true` 的条目；
- 只读端点：
  - `GET /api/sessions/{sessionId}/deliverables`
  - `GET /api/sessions/{sessionId}/deliverables/{deliverableId}`
- 递归子会话只返回当前会话可见的 output；不返回 `work/`、`tasks/`、`code/`、`data/`、`_internal/`、`specs/`；
- 不返回绝对路径；只返回稳定 `deliverableId`、展示名、类型、大小、创建时间、授权下载引用；
- 不提供写接口；上传/生成通过对话/任务，交付物只能读/下载。

### 6.2 响应示例

```json
{
  "sessionId": "main",
  "items": [
    {
      "id": "dlv_01",
      "name": "conversation-panel-spec.md",
      "kind": "file",
      "size": 18240,
      "createdAt": 1760000000000,
      "taskId": "task-a1b2c3d4",
      "downloadRef": "deliverable:dlv_01"
    }
  ],
  "total": 1
}
```

- `downloadRef` 只能换取已授权内容；服务端再做 canonical 路径校验；
- 404/403 不区分“不存在”和“无权限”的细节（避免探测）；
- `work` 路径即使知道也拒绝；**不因任务结束自动暴露 work**。

---

## 7. 迁移映射（旧 → 新）

> 迁移是**复制/建立索引**，不删除旧数据；先停服务/备份，再执行。

| 旧路径 | 新路径 | 说明 |
|---|---|---|
| `SIMO_HOME/data/workspace/**` | `SIMO_HOME/workspace/main/data/legacy-workspace/**` | 旧工具沙盒内容归入 main 的 data；不自动当交付物 |
| `SIMO_HOME/data/artifacts/session-*/**` | `SIMO_HOME/workspace/main/output/legacy/session-*/**` | 旧会话产物视为用户交付物；补 `user_delivery:true` |
| `SIMO_HOME/data/artifacts/task-*/**` | `SIMO_HOME/workspace/main/output/legacy/task-*/**` | 旧任务产物保留用户可见性；manifest 记录来源 |
| `SIMO_HOME/data/artifacts/<other>/**` | `SIMO_HOME/workspace/main/output/legacy/<other>/**` | 其他旧产物按用户交付物处理；无法判定时先放 data 并标记待确认 |
| 现有 SessionSpec（若有） | `SIMO_HOME/workspace/specs/main/spec.md`（及对应子会话镜像） | 无 spec 则生成 draft 占位；不伪造目标/任务 |

迁移产物：

- `workspace/main/_internal/migration/workspace-layout-v1.json`：源→目标、hash、时间、迁移版本；
- 旧目录保留只读或原地不动；迁移失败整体可重试；
- 旧 `data/workspace`/`data/artifacts` 不删除；API 不再直接读旧路径；
- 迁移后做抽样 hash 对账；不通过不切换新路径。

---

## 8. 权限、路径安全、备份

### 8.1 路径安全

- 所有路径先 canonicalize（realpath），必须位于 `SIMO_HOME/workspace/` 内；
- 拒绝 `..`、绝对路径、盘符、UNC、符号链接/junction 指向根外；拒绝空字节/控制字符；
- 会话只能读写自己的节点；跨 session 读写需显式授权（默认拒绝）；
- `_internal/` 只后端内部读写；API/工具不暴露；
- 提升/清理/迁移都必须二次校验源/目标在允许根内；失败 fail-closed。

### 8.2 权限

- `output/` 对用户只读；写只能由提升器；
- `work/` 任务/执行器可写；API 不读；
- `specs/` 由 SessionSpec 写入；用户只读（通过 Spec 视图）；不接受任意 PATCH；
- 权限判断以会话归属为准，不以路径字符串猜测。

### 8.3 备份

- **必备份**：`workspace/main`（含 output/_internal）、`workspace/specs`；
- **可选备份**：`workspace/work`（临时，可重建；默认排除以减小包）；
- 备份清单记录 workspace schema 版本、文件 hash、迁移版本；恢复时校验 `..`/symlink；
- 恢复顺序：specs/main → main/_internal 清单 → main/output → 可选 work；不覆盖新版本 output，冲突走版本后缀；
- 备份不改变路径命名；不把 work 误标为交付物。

---

## 9. 验收清单

| # | 场景 | 通过标准 |
|---|---|---|
| W1 | 创建主会话 | `workspace/main/{code,data,output,tasks,_internal,conversations}` 全部创建；`specs/main`、`work/main` 存在 |
| W2 | 创建子会话 | 父 `conversations/<slug>-<shortId>` 递归同构；`specs/main/conversations/...`、`work/main/conversations/...` 镜像；无环 |
| W3 | 重命名会话 | 显示名变化；目录/shortId 不变；子会话路径不变 |
| W4 | 任务提升 | 只有 manifest `user_delivery:true` 进入 output；`_internal/promotions` 有 hash/来源；work 不自动暴露 |
| W5 | 失败/取消 | 不提升；work 保留；output 无半成品；30 天 TTL 可生效 |
| W6 | 清理 | 只清 work 过期内容；运行中/`.keep` 跳过；不删 output/specs/审计；有 cleanup 记录 |
| W7 | 交付物 API | 只返回 output + user_delivery；work/tasks/code/data/_internal/specs 不出现；无绝对路径 |
| W8 | 迁移 | 旧 data/workspace、data/artifacts 按表映射；hash 对账；旧数据保留；无丢失 |
| W9 | 路径安全 | `..`/绝对路径/盘符/UNC/symlink 穿越全部拒绝；跨会话拒绝 |
| W10 | 备份 | main+specs 必含；work 可选；恢复不越界、不覆盖新 output；hash/清单可验证 |

---

*本文件只定义目录规范/接口/迁移/验收，不改代码；TTL 默认值与持久化范围以产品/后端确认后为准。*
