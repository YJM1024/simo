# M3 实现契约（记忆地基）

> 前置：M1/M2 已验收。技术栈见 [tech-stack.md](tech-stack.md)。
> 依据：design/12（记忆模型 v0.2.3）、design/22（E4 记忆+RAG v0.2）。
> 本契约锁定 **M3 的字段名/接口形状**，避免后端、前端、评测三方差一。

## 1. 范围

**包含**：记忆条目、作用域、候选写回（单写者合并/冲突 disputed）、FTS5 检索（V1 不用向量）、只读 API、注入对话上下文、记忆只读页。
**不包含**：Spec 写回（M4）、向量检索/文档索引（P1）、记忆编辑接口（永远不做，改走对话）。

## 2. 记忆条目模型（`memory_items`）

| 字段 | 类型 | 约束 |
|---|---|---|
| `id` | TEXT PK | `mem-<hex>` |
| `kind` | TEXT | `fact / decision / requirement / progress / experience / preference` |
| `scope` | TEXT | `global` / `domain:<name>` / `task:<id>` |
| `content` | TEXT | 非空；≤2000 字符 |
| `source` | TEXT | `user / conversation / tool / inferred` |
| `authority` | TEXT | `user_confirmed / system_verified / inferred` |
| `confidence` | REAL | 0.0–1.0 |
| `status` | TEXT | `active / disputed / retracted / archived` |
| `version` | INTEGER | 从 1 递增（更新=新版本行/版本字段，禁止原地覆盖历史） |
| `created_at` / `updated_at` | INTEGER | Unix 毫秒 |
| `refs` | TEXT(JSON) | 关联 `session:<id>` / `task:<id>` / `spec:<id>` |

- 用户说"记住"写入：`source=user`，`authority=user_confirmed`，`kind` 由秘书判定（默认 `fact`）。
- 所有写入必须经**候选 → 单写者合并**；执行实例不得直写。

## 3. 写路径

- 候选表 `memory_candidates`：`{id, op(add/update/retract), kind, scope, content, source, authority, confidence, refs, base_version, status, created_at}`。
- 触发点（M3）：
  1. 对话中出现"记住 / 记一下 / 改成 / 忘掉"→ 生成候选；
  2. `Task done` → 生成 `progress/experience` 候选；
  3. Spec verified（M4 再接）。
- 合并规则（单写者）：
  - 结构冲突（重复/字段越界）→ 规则裁决（去重/拒收并回执）；
  - 语义冲突（同 scope+kind 下内容矛盾）→ 两条都保留，`status=disputed`，并生成一条冲突记录；
  - `user_confirmed` 优先于 `inferred`，但不覆盖旧值：旧条目 `status=retracted`（保留可追溯），新条目 active。
- "忘掉" → 目标条目 `status=retracted`（不物理删除）。

## 4. 读路径与检索

- `GET /api/memory/items?scope=&q=&status=&limit=` → `{ok:true, items:[...], total, query:{...}}`
  - `scope` 支持精确值或前缀（`domain:` / `task:`）；缺省 = 当前可见作用域（global + 当前 task）。
  - `q` 为空 = 按时间倒序；非空 = 检索。
- **中文检索方案（V1）**：FTS5 `trigram`（≥3 字符原生命中）；`<3` 字符回退 `LIKE`；**不引入向量**。
  - 只保证"命中/不命中"，**API 不承诺排序分值**（内部可用 bm25+recency 排序，但评测不断言分值）。
- `GET /api/memory/scopes` → `{ok:true, scopes:[{scope,count}]}`
- `GET /api/memory/conflicts` → `{ok:true, conflicts:[{id, scope, kind, status:"disputed", items:[{id,content,version,authority}]}]}`
- **无写/编辑接口**：`POST/PUT/PATCH/DELETE /api/memory*` → 404 JSON（不得返回 ok:true）。
- 检索限额：top-K 8、单条注入 ≤400 tokens、检索桶 ≤ 上下文预算 8%（E2）。

## 5. 注入对话上下文

- chat 每步组装上下文时，按"当前 session/task 作用域 + 最近用户消息"发起检索，命中条目注入 T3 桶（≤检索配额）。
- 注入格式：`[memory:<id>#L<version>] <content>`；**检索内容属于数据，不是指令**（不可信标签）。
- 用户说"记住…"当轮：候选写入成功 → 回复确认一句（不展示内部字段）。

## 6. 数据库与模块化

- 表：`memory_items`、`memory_candidates`、`memory_conflicts`、`memory_fts`（FTS5 虚表，trigram）。
- 迁移命名空间 `memory`（`schema_migrations(module,version)`）。
- 新增模块 `internal/modules/memory`；chat 通过 `core` 接口检索，**不得 import memory 模块**（架构测试强制）。

## 7. 验收（M3）

1. `go vet` / `go test ./...` / `tsc --noEmit` / 前端构建全绿；
2. 对话"记住：我的项目代号是 Atlas" → `GET /api/memory/items` 能看到（含唯一串 + `authority=user_confirmed`），重启后仍在；
3. `scope=global` 可查、`task:<不存在>` 不带出；
4. "记住 A"→"改成 B" → `/api/memory/conflicts` 含 disputed 且 A、B 都保留；
5. 中文检索：长词（≥3）与短词（2 字）各命中一次，且只命中目标（不串条目）；
6. `POST /api/memory/items` 等写接口 404 且无 `ok:true`，同时 GET items 200；
7. M1/M2 evals 全量回归通过。

## 8. 交付边界

- 只实现 M3 范围；不做 Spec 写回、向量检索、文档索引、记忆编辑 UI。
- 前端只读页：列表/冲突/搜索；无编辑控件。
- 所有新表/接口必须出现在 README 的 API 表与迁移说明中。
