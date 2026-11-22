# P4 · 文件与交付物（产品域 Spec）

状态：**active**（产品域 spec；实现状态逐项标注，不把接口存在当产品完成）
> 产品域：`P4`；技术域码：`FILE`；ID 规则见 [`../../../docs/product/ID-SPEC.md`](../../../docs/product/ID-SPEC.md)。
> 对应测试计划：[`../../test/P4-FILE/test-plan.md`](../../test/P4-FILE/test-plan.md)；功能树：[`../../../docs/product/TREE.md`](../../../docs/product/TREE.md)；追溯：[TRACEABILITY.md](../../../docs/product/TRACEABILITY.md)。
> AC 改写记录：2026-11-22 按 [`CHG-B1-001`](../../changes/CHG-B1-001/spec.md) 把 6 个 PRD 的泛化 AC 改写为可判定判据；状态列未变，覆盖状态未变。

## 1. 目标

把“文件与交付物”从零散接口/旧 FE 规格收敛成可验收的产品能力：明确场景、行为、AC 与实现状态；**未实现的能力标 `unimplemented`，不得写成已完成**。

本域覆盖 6 个 L3 功能点：implemented 1、partial 5、unimplemented 0。

## 2. 非目标

- 不在本 spec 定义具体组件视觉与代码结构；组件契约见 `specs/COMP-*`，变更开发 spec 见 `specs/changes/<CHG>/`。
- 不把后端路由/数据库表存在等同于用户可用；没有入口或没有证据的能力最多算 `partial`。
- 不为本域每个功能点新建独立 spec；功能点在本文档内以 PRD 章节维护。
- 不在本轮修改代码、测试或部署。

## 3. 场景

- S1 文件聚合：用户从文件与交付物入口完成文件聚合相关任务；正常、空、加载、错误与权限不足都必须有可见结果。
- S2 上传与附件：用户从文件与交付物入口完成上传与附件相关任务；正常、空、加载、错误与权限不足都必须有可见结果。
- S3 交付物：用户从文件与交付物入口完成交付物相关任务；正常、空、加载、错误与权限不足都必须有可见结果。
- S4 预览与下载：用户从文件与交付物入口完成预览与下载相关任务；正常、空、加载、错误与权限不足都必须有可见结果。
- S5 文件生成：用户从文件与交付物入口完成文件生成相关任务；正常、空、加载、错误与权限不足都必须有可见结果。

## 4. 功能点与需求

> 每个功能点包含：PRD、优先级、实现状态、落地前差距、目标行为、AC。目标行为是**产品要求**，不是“已经实现”的声明。
>
> **AC 写法约定**（同 P2）：`自动` 指 `scripts/ac/<AC-ID>.mjs` 断言；`人工` 指验收 Agent 在 8787 走查并截图，定义行内标 `人工：<理由≥8字>`；`自动+人工` 指脚本断言接口/数据、人工核对界面。判定口径只用白名单六类。文件类错误路径同时写状态码与错误文案。

### 4.1 L2 · 文件聚合

#### PRD-FILE-001 · 会话文件聚合与列表
<a id="prd-file-001"></a>

- 优先级：P0
- 实现状态：`partial`
- 关联：CHANGE [CHG-B1-001](../../changes/CHG-B1-001/spec.md)；开发 [M11](../../../docs/m11-contract.md)；组件 —；任务卡 [后端任务](../../../docs/tasks/backend.md)
- 落地前差距（历史审计）：后端聚合/分页存在，前端无文件页；无域级测试与证据。
- 当前剩余缺口：前端无文件页入口；AC 已改写为可判定，域级证据仍 missing。
- 目标行为：会话内能进入文件页，页内列出该会话的产物、上传与工作区文件，字段完整、空态与失败有出口，非法 `kind` 与会话不存在都被明确拒绝。
- AC：
  - `AC-FILE-001-01` **主路径：会话文件页入口与条数一致**；前置：会话 S 有 2 个 artifact、1 个 upload；动作：在会话右栏点击「文件」标签进入文件页；观察：抽屉内列出 3 行文件；判据：入口固定在会话右栏「文件」标签，`GET /api/sessions/S/files` 返回 `ok=true`、`total=3`，DOM 文件行数 = `files.length`，逐行 `name` 与接口一致（2026-11-22 已裁决）；断言：`scripts/ac/AC-FILE-001-01.mjs` case `主路径`；证据：脚本 JSON + 走查截图；判定：自动+人工。
  - `AC-FILE-001-02` **列表字段完整**；前置：同上 3 个文件；动作：读取列表；观察：每行显示文件名、大小、类型、时间；判据：接口每项含 `id/kind/name/mime/size/createdAt/source/previewUrl/downloadUrl` 九字段；DOM 每行文本含格式化后的大小（`B/KB/MB`，1 位小数，容差 0.1）与时间；缺字段即 fail；断言：`scripts/ac/AC-FILE-001-02.mjs` case `主路径`；证据：脚本 JSON + 截图；判定：自动+人工。
  - `AC-FILE-001-03` **空态**；前置：会话 S0 无任何文件；动作：打开文件页；观察：显示空态文案，文件行数为 0 且不显示假总数；判据：接口 `total=0`、`files=[]`，DOM 空态节点存在、文件行数为 0；断言：`scripts/ac/AC-FILE-001-03.mjs` case `主路径`；证据：脚本 JSON + 截图；判定：自动+人工。
  - `AC-FILE-001-04` **加载失败可重试**；前置：把 `/api/sessions/S/files` 置为 500；动作：打开文件页并点击「重试」；观察：先出现错误态，点击后重新请求；判据：错误态期间文件行数为 0；点击后该接口请求计数由 1 变 2；断言：`scripts/ac/AC-FILE-001-04.mjs` case `负路径-接口 500`；证据：脚本 JSON + 网络日志；判定：自动。
  - `AC-FILE-001-05` **负路径：非法 kind 被拒**；前置：无；动作：`GET /api/sessions/S/files?kind=docx`；观察：返回 400，文案为「kind 只支持 artifact\|upload\|workspace」；判据：HTTP 400 + `error.message` 精确匹配该文案；前端下拉不提供 `docx` 选项（DOM 选项集合 = 3 类或含「全部」）；断言：`scripts/ac/AC-FILE-001-05.mjs` case `负路径-非法 kind`；证据：脚本 JSON；判定：自动。
  - `AC-FILE-001-06` **负路径：会话不存在**；前置：会话 id `nope` 不存在；动作：`GET /api/sessions/nope/files`；观察：返回 404，文案为「会话不存在」；判据：HTTP 404 + `error.message="会话不存在"`，前端显示同文案且不渲染空态；断言：`scripts/ac/AC-FILE-001-06.mjs` case `负路径-会话不存在`；证据：脚本 JSON + 截图；判定：自动+人工。

#### PRD-FILE-005 · 工作区目录与输出隔离
<a id="prd-file-005"></a>

- 优先级：P1
- 实现状态：`partial`
- 关联：CHANGE [CHG-B1-001](../../changes/CHG-B1-001/spec.md)；开发 [M11](../../../docs/m11-contract.md)；组件 —；任务卡 [后端任务](../../../docs/tasks/backend.md)
- 落地前差距（历史审计）：仅 docs/workspace-layout 约定；无隔离/越权测试。
- 当前剩余缺口：隔离只靠接口内路径校验，缺负用例证据；AC 已改写为可判定。
- 目标行为：产物、上传、工作区文件各自落在约定根目录下；任何越出根目录的读请求返回 404 且文案明确；internal 产物在文件页默认不可见。
- AC：
  - `AC-FILE-005-01` **产物落盘位置**；前置：任务产出 1 个 artifact；动作：读取 `artifacts` 行与磁盘路径；观察：文件位于 sandbox `Artifacts` 根下；判据：`filepath.Rel(ArtifactsRoot, absPath)` 结果不以 `..` 开头，且 `storage_scope` 字段非空；断言：`scripts/ac/AC-FILE-005-01.mjs` case `主路径`；证据：脚本 JSON（含相对路径）；判定：自动。
  - `AC-FILE-005-02` **负路径：越界产物读被拒**；前置：库中存在 1 条路径为 `../../etc/passwd` 形状的产物行（测试夹具直接写库）；动作：`GET /api/artifacts/{id}/content?source=files`；观察：返回 404，文案「产物路径非法」；判据：HTTP 404 + `error.message="产物路径非法"`，响应正文不含文件内容；断言：`scripts/ac/AC-FILE-005-02.mjs` case `负路径-路径穿越`；证据：脚本 JSON（含响应片段 0 字节断言）；判定：自动。
  - `AC-FILE-005-03` **负路径：越界上传被拒**；前置：上传表单字段文件名取 `../../evil.txt`；动作：`POST /api/uploads`；观察：返回 4xx，磁盘 `Uploads` 根之外不出现该文件；判据：HTTP 400–499，且 `Uploads` 根之外路径不存在；断言：`scripts/ac/AC-FILE-005-03.mjs` case `负路径-上传穿越`；证据：脚本 JSON（含两次文件存在性检查）；判定：自动。
  - `AC-FILE-005-04` **internal 产物默认不可见**；前置：任务产出 1 个 `delivery_kind=internal` 的 artifact；动作：`GET /api/artifacts/{id}/content`（不带 `source=files`）；观察：返回 404，文案「产物路径非法或不可作为用户交付物」；判据：HTTP 404 + 文案精确匹配；带 `source=files` 时 200；断言：`scripts/ac/AC-FILE-005-04.mjs` case `负路径-internal 产物`；证据：脚本 JSON；判定：自动。
  - `AC-FILE-005-05` **工作区文件不出根**；前置：`kind=workspace` 聚合结果 1 条；动作：读取 `previewUrl` 与磁盘路径；观察：路径在 `Workspace` 根下；判据：`filepath.Rel(WorkspaceRoot, absPath)` 不以 `..` 开头；构造 `../` workspace 行后 `GET content` 返回 404「产物路径非法」；断言：`scripts/ac/AC-FILE-005-05.mjs` case `边界-工作区`；证据：脚本 JSON；判定：自动。

### 4.2 L2 · 上传与附件

#### PRD-FILE-002 · 上传与附件
<a id="prd-file-002"></a>

- 优先级：P0
- 实现状态：`partial`
- 关联：CHANGE [CHG-B1-001](../../changes/CHG-B1-001/spec.md)；开发 [M8](../../../docs/m8-contract.md) / [M11](../../../docs/m11-contract.md)；组件 —；任务卡 [后端任务](../../../docs/tasks/backend.md)
- 落地前差距（历史审计）：上传后端存在，前端无附件入口；缺大小/类型/失败路径 AC。
- 当前剩余缺口：前端附件入口未做；大小与类型上限未核实；AC 已改写为可判定。
- 目标行为：用户能上传附件，上传成功后附件出现在会话文件列表并可预览下载；超限、空文件、非法类型都被拒绝且不留半成品。
- AC：
  - `AC-FILE-002-01` **主路径：上传成功**；前置：准备 1024 字节的 `note.txt`；动作：`POST /api/uploads` 上传；观察：返回 2xx 且带上传 id；判据：HTTP 200，响应含 `id`，随后 `GET /api/uploads/{id}` 返回 200、`Content-Length=1024`；断言：`scripts/ac/AC-FILE-002-01.mjs` case `主路径`；证据：脚本 JSON；判定：自动。
  - `AC-FILE-002-02` **上传后进入会话文件列表**；前置：同上上传成功；动作：`GET /api/sessions/S/files?kind=upload`；观察：列表含该附件；判据：`files` 中该 `id` 存在，`kind="upload"`，`previewUrl` 与 `downloadUrl` 均指向 `/api/uploads/{id}`；断言：`scripts/ac/AC-FILE-002-02.mjs` case `主路径`；证据：脚本 JSON；判定：自动。
  - `AC-FILE-002-03` **负路径：超过大小上限被拒**；前置：单文件上限 20 MiB（`backend/internal/modules/chat/attachments.go:22`）；动作：上传 20 MiB + 1 字节的文件；观察：返回 413，文案「单文件超过 20 MiB」；判据：HTTP 413 + `error.code="file_too_large"`，且该次上传不在 `GET files?kind=upload` 中；断言：`scripts/ac/AC-FILE-002-03.mjs` case `负路径-超限`；证据：脚本 JSON；判定：自动。
  - `AC-FILE-002-04` **负路径：非法类型与空文件被拒**；前置：准备 `evil.exe` 与 0 字节的 `empty.txt`；动作：分别 `POST /api/uploads`；观察：两次都返回 4xx 且不写盘；判据：`evil.exe` 返回 HTTP 400–499；`empty.txt` 返回 HTTP 400 且 `error.code="empty_file"`（2026-11-22 已裁决）；`Uploads` 根下两个文件名均不存在；断言：`scripts/ac/AC-FILE-002-04.mjs` case `负路径-非法类型` 与 `负路径-空文件`；证据：脚本 JSON；判定：自动。现状差异 D-01：当前只有文件名规约与 MIME 推断，没有扩展名白名单，本 AC 在实现白名单前应记 fail/待实现，不得记通过。
  - `AC-FILE-002-05` **失败不留半成品**；前置：已上传 `a.txt` 后，同一消息里再带 1 个超限文件；动作：`POST /api/uploads`；观察：整批拒绝，`a.txt` 也不入库；判据：HTTP 413，`GET files?kind=upload` 中 `a.txt` 计数为 0（`cleanup()` 回滚，`attachments.go:147-151`）；断言：`scripts/ac/AC-FILE-002-05.mjs` case `负路径-批量回滚`；证据：脚本 JSON（含前后两次列表）；判定：自动。

### 4.3 L2 · 交付物

#### PRD-FILE-003 · 交付物卡片与列表
<a id="prd-file-003"></a>

- 优先级：P0
- 实现状态：`implemented`
- 关联：CHANGE [CHG-B1-001](../../changes/CHG-B1-001/spec.md) / [FE-003](../../FE-003-chat-capabilities/spec.md) / [FE-005](../../FE-005-workbench/spec.md)；开发 [FE-003](../../FE-003-chat-capabilities/spec.md) / [FE-005](../../FE-005-workbench/spec.md) / [M11](../../../docs/m11-contract.md)；组件 —；任务卡 [前端任务](../../../docs/tasks/frontend.md)
- 落地前差距（历史审计）：卡片状态与可操作性未统一。
- 当前剩余缺口：卡片状态与可操作性缺判据；AC 已改写为可判定，域级证据仍 missing。
- 目标行为：工作台交付物列表只展示用户交付物，分页不重不漏，卡片字段完整且可点开预览与下载，空态与非法参数都有明确结果。
- AC：
  - `AC-FILE-003-01` **主路径：列表条数与分页**；前置：库中 6 条 `user_delivery`；动作：`GET /api/deliverables?limit=5&offset=0`；观察：返回 5 条且 `hasMore=true`；判据：`deliverables.length=5`、`total=6`、`hasMore=true`，DOM 卡片数=5；断言：`scripts/ac/AC-FILE-003-01.mjs` case `主路径`；证据：脚本 JSON + 截图；判定：自动+人工。
  - `AC-FILE-003-02` **卡片字段与可点击**；前置：同上；动作：读取首张卡片；观察：显示名称、类型、大小、时间，并有预览与下载两个可点击入口；判据：接口项含 `previewUrl/downloadUrl`，DOM 两个按钮的命中区域各 ≥ 32×32 px（`getBoundingClientRect`）；断言：`scripts/ac/AC-FILE-003-02.mjs` case `主路径`；证据：脚本 JSON（含矩形）+ 截图；判定：自动+人工。
  - `AC-FILE-003-03` **分页不重不漏**；前置：6 条交付物；动作：依次请求 `limit=3&offset=0` 与 `limit=3&offset=3`；观察：两页 id 集合无交集，合计 6 条；判据：两次响应 `id` 交集为空、并集大小=6，第二次 `hasMore=false`；断言：`scripts/ac/AC-FILE-003-03.mjs` case `主路径`；证据：脚本 JSON；判定：自动。
  - `AC-FILE-003-04` **空态**；前置：无 `user_delivery` 行；动作：打开工作台；观察：空态文案，卡片数 0；判据：接口 `total=0`、`deliverables=[]`，DOM 空态节点存在且卡片数 0；断言：`scripts/ac/AC-FILE-003-04.mjs` case `主路径`；证据：脚本 JSON + 截图；判定：自动+人工。
  - `AC-FILE-003-05` **负路径：非法参数**；前置：无；动作：依次请求 `limit=0`、`limit=101`、`offset=-1`、`foo=1`；观察：四次都返回 400 且 code 分别为 `invalid_limit`、`invalid_limit`、`invalid_offset`、`invalid_argument`；判据：HTTP 400 + `error.code` 精确匹配四项，前端不发送这四类参数；断言：`scripts/ac/AC-FILE-003-05.mjs` case `负路径-非法参数`；证据：脚本 JSON；判定：自动。

### 4.4 L2 · 预览与下载

#### PRD-FILE-004 · 预览与下载
<a id="prd-file-004"></a>

- 优先级：P0
- 实现状态：`partial`
- 关联：CHANGE [CHG-B1-001](../../changes/CHG-B1-001/spec.md) / [FE-005](../../FE-005-workbench/spec.md)；开发 [FE-005](../../FE-005-workbench/spec.md) / [M11](../../../docs/m11-contract.md) / [M12](../../../docs/m12-contract.md)；组件 —；任务卡 [前端任务](../../../docs/tasks/frontend.md)
- 落地前差距（历史审计）：打开/预览未验证；Markdown/代码/图片/PDF 无分类型验收。
- 当前剩余缺口：分类型渲染未验收；下载文件名安全未验收；AC 已改写为可判定。
- 目标行为：点预览打开内容且按类型呈现，点下载得到附件；产物不存在或路径非法时返回 404 并给出明确文案，前端不白屏。
- AC：
  - `AC-FILE-004-01` **主路径：预览内联打开**；前置：存在 1 个 Markdown 产物；动作：打开 `previewUrl`；观察：返回 200，正文按类型渲染；判据：HTTP 200，`Content-Type` 以 `text/markdown` 或 `text/plain` 开头，`Content-Disposition` 为 `inline`；断言：`scripts/ac/AC-FILE-004-01.mjs` case `主路径`；证据：脚本 JSON；判定：自动。
  - `AC-FILE-004-02` **主路径：下载为附件且文件名可还原**；前置：产物名为 `季度报告.md`；动作：打开 `downloadUrl`；观察：浏览器按附件下载；判据：HTTP 200，`Content-Disposition` 以 `attachment` 开头，含 `filename*=UTF-8''` 且解码后等于 `季度报告.md`；断言：`scripts/ac/AC-FILE-004-02.mjs` case `主路径`；证据：脚本 JSON（含响应头原文）；判定：自动。
  - `AC-FILE-004-03` **分类型渲染**；前置：准备 Markdown、代码（`.ts`）、图片（`.png`）、PDF 四类产物；动作：在文件页依次点开预览；观察：Markdown 不显示 `#` 原文，代码以等宽字体显示，图片 `img` 的 `naturalWidth > 0`，PDF 点击后在新标签页打开 `previewUrl` 且抽屉内不出现内嵌查看器；判据：前三个 case 在会话右栏「文件」标签的抽屉内断言 DOM 结构，代码 case 另断言 `getComputedStyle` 的 `font-family` 含 `monospace`；PDF case 断言新标签页 URL 等于 `previewUrl`、抽屉内无内嵌查看器节点；四个 case 均断言抽屉内存在下载入口（2026-11-22 已裁决：PDF 走新标签页）；断言：`scripts/ac/AC-FILE-004-03.mjs` case `主路径-<类型>` 四条；证据：脚本 JSON + 四张截图；判定：自动+人工。
  - `AC-FILE-004-04` **负路径：产物文件不存在**；前置：删除磁盘文件但保留 artifact 行；动作：`GET /api/artifacts/{id}/content`；观察：返回 404，文案「产物不存在」，前端显示该文案且不白屏；判据：HTTP 404 + `error.message="产物不存在"`，DOM 出现错误提示节点；断言：`scripts/ac/AC-FILE-004-04.mjs` case `负路径-文件缺失`；证据：脚本 JSON + 截图；判定：自动+人工。
  - `AC-FILE-004-05` **负路径：下载文件名不带路径**；前置：构造文件名 `../evil.md` 的产物行；动作：`GET ...&download=1`；观察：返回 404「产物路径非法」或 200 且文件名被规约为 `evil.md`；判据：若 200，响应头文件名解码后不含 `/` 与 `..`；若 404，文案精确匹配；断言：`scripts/ac/AC-FILE-004-05.mjs` case `负路径-文件名穿越`；证据：脚本 JSON；判定：自动。
  - `AC-FILE-004-06` **负路径：source 参数越权不生效**；前置：internal 产物 1 个；动作：`GET content?source=other`；观察：返回 404；判据：HTTP 404，`source` 只认 `files`（其它值等同未传）；断言：`scripts/ac/AC-FILE-004-06.mjs` case `负路径-source`；证据：脚本 JSON；判定：自动。

### 4.5 L2 · 文件生成

#### PRD-FILE-006 · 文件生成（PDF/Office/图片）
<a id="prd-file-006"></a>

- 优先级：P1
- 实现状态：`partial`
- 关联：CHANGE [CHG-B1-001](../../changes/CHG-B1-001/spec.md)；开发 [M12](../../../docs/m12-contract.md)；组件 —；任务卡 [后端任务](../../../docs/tasks/backend.md)
- 落地前差距（历史审计）：后端文件生成契约存在；无统一产品 AC、无生成失败/回滚测试。
- 当前剩余缺口：生成失败与回滚无判据；AC 已改写为可判定。
- 目标行为：生成 PDF、Office、图片各得到真实文件（按魔数校验），产物以用户交付物身份出现在交付物列表；生成失败不留半成品。
- AC：
  - `AC-FILE-006-01` **主路径：三类文件生成**；前置：请求生成 1 个 PDF、1 个 xlsx、1 个 png；动作：等待生成完成；观察：三个文件可按预览地址取到；判据：三个 `GET content` 均 200，前 8 字节分别为 `%PDF-`、`PK\x03\x04`、`\x89PNG`；断言：`scripts/ac/AC-FILE-006-01.mjs` case `主路径-<类型>` 三条；证据：脚本 JSON（含十六进制头）；判定：自动。
  - `AC-FILE-006-02` **生成失败不留半成品**；前置：构造生成器报错（非法模板参数）；动作：发起生成；观察：任务失败，产物列表无该次条目；判据：`artifacts` 中该 `task_id` 计数为 0，任务 `status="failed"` 且 `outcome` 非空；断言：`scripts/ac/AC-FILE-006-02.mjs` case `负路径-生成失败`；证据：脚本 JSON；判定：自动。
  - `AC-FILE-006-03` **交付物可见有时限**；前置：生成成功；动作：起点为生成接口返回时刻，轮询 `GET /api/deliverables`；观察：5 秒内出现该产物；判据：5 秒内列表含该 artifact id 且 `previewUrl` 返回 200；断言：`scripts/ac/AC-FILE-006-03.mjs` case `主路径`；证据：脚本 JSON（含时间戳）；判定：自动。
  - `AC-FILE-006-04` **重复生成的去重口径**；前置：同名同内容生成两次，再生成第三次；动作：读取交付物列表；观察：每次生成新增一条产物，文件名依次追加 `-2`、`-3`，首条不被覆盖；判据：列表出现 3 条 id 不同的产物，`name` 分别为 `x`、`x-2`、`x-3`（带扩展名时如 `报告.pdf`、`报告-2.pdf`、`报告-3.pdf`），首条的 `size` 与 `createdAt` 不变，不出现覆盖或同名重复（2026-11-22 已裁决）；断言：`scripts/ac/AC-FILE-006-04.mjs` case `边界-重复生成`；证据：脚本 JSON；判定：自动。

## 5. 验收标准（A1–A8）

| ID | 验收标准 | 适用性 |
|---|---|---|
| A1 | 本域全部 P0 PRD 的主路径可走通，结果与状态一致 | 必验 |
| A2 | 空、加载、错误、权限不足至少各有一条可见反馈，不静默失败 | 必验 |
| A3 | 有 UI 的功能点可用键盘完成主路径，焦点可见；纯后端域标 N/A 并说明 | 有 UI 必验，否则 N/A |
| A4 | 有 UI 的功能点在 375px 宽度不横向溢出、不遮挡主操作；纯后端域 N/A | 有 UI 必验，否则 N/A |
| A5 | 不展示假 0/假成功；未实现/无证据项在界面与文档中明确标注 | 必验 |
| A6 | 权限/隔离类功能默认拒绝，越权路径不因前端隐藏按钮而被视为安全 | 涉及权限/团队/文件必验 |
| A7 | `unimplemented` 项在 TREE/TRACEABILITY/spec 中一致标注，且不被计入 covered | 必验 |
| A8 | 每个 A/PRD 至少映射一个测试用例；当前证据缺失的写 `missing`，不得写“通过” | 必验 |

## 6. 当前实现状态与未实现项

| PRD | 功能点 | 状态 | 说明 |
|---|---|---|---|
| `PRD-FILE-001` | 会话文件聚合与列表 | `partial` | 部分；后端聚合存在，前端无文件页；AC 已改写为可判定。 |
| `PRD-FILE-005` | 工作区目录与输出隔离 | `partial` | 部分；接口内有路径校验，缺负用例证据；AC 已改写为可判定。 |
| `PRD-FILE-002` | 上传与附件 | `partial` | 部分；上传后端存在，前端无附件入口；类型白名单未见实现。 |
| `PRD-FILE-003` | 交付物卡片与列表 | `implemented` | 已签；卡片状态与可操作性已补判据，证据仍 missing。 |
| `PRD-FILE-004` | 预览与下载 | `partial` | 部分；分类型渲染与文件名安全已补判据。 |
| `PRD-FILE-006` | 文件生成（PDF/Office/图片） | `partial` | 部分；生成契约存在，失败/回滚已补判据。 |

**未实现项（unimplemented）**：无。

> 说明：`implemented` 只表示“有验收/可运行实现”的现状摘要；不等于本 spec 的 AC 已全部重跑。所有执行证据见测试计划的“当前证据”列。

## 7. 依赖、风险与待确认

- 依赖：`FILE` 的能力必须与现有 FE/COMP/契约一致；冲突时以本 spec 的产品行为为准，并开变更包修正。
- 风险：旧 `docs/tasks/frontend.md` 与后端能力面不一致；本 spec 不把“后端有接口”当“前端可用”。
- 待确认：AC 重跑排期与证据归档。
- 证据：测试计划 [`../../test/P4-FILE/test-plan.md`](../../test/P4-FILE/test-plan.md)；未执行项一律 `missing`。

## 8. 现状差异与裁决

**现状差异（产品要求与代码现状冲突，均标 待实现）**

- `D-01` FILE-002 上传无扩展名白名单：`backend/internal/modules/chat/attachments.go` 只做文件名规约（`sanitizeUploadName`）与落点校验（`:280` `isUnderUploadsRoot`），未见类型限制。产品要求拒绝可执行文件，**待实现**。
- `D-02` FILE-002 超限口径已实现但产品文档未记录：上限 20 MiB（`attachments.go:22`），超限返回 413 + `file_too_large`「单文件超过 20 MiB」（`:153-155`、`:197-200`），批量失败会 `cleanup()` 回滚已写文件（`:147-151`）。本 spec 已按此写死 AC-FILE-002-03/05；无实现缺口。
- `D-03` FILE-001 前端无文件页：`frontend/src/app.tsx` 只有工作台交付物入口（`:813-814` 打开 `previewUrl`）与任务组，没有按 `kind` 过滤的文件页。产品要求"会话内列出文件"，**待实现**。
- `D-04` FILE-004 打开方式为整页跳转：`:813-814` 使用 `window.open(previewUrl)`，没有分类型渲染层。产品要求 Markdown/代码/图片/PDF 分类型呈现，**待实现**。
- `D-05` FILE-003 分页参数由前端写死：工作台调用 `getDeliverables` 时未传 `limit/offset`，依赖服务端默认值；产品要求分页不重不漏，**待实现/待核**。

**已裁决（2026-11-22）**

- `Q-01` FILE-002 空文件：**已裁决（2026-11-22）** 0 字节文件拒绝上传，返回 HTTP 400、`error.code="empty_file"`，不入库、不写盘。依据 Lead 2026-11-22 裁决。
- `Q-02` FILE-004 预览承载：**已裁决（2026-11-22）** 预览在会话右栏「文件」标签内以抽屉渲染；PDF 不在抽屉内渲染，点击后在新标签页打开 `previewUrl`；所有类型始终提供下载入口。依据 Lead 2026-11-22 裁决。
- `Q-03` FILE-006 同名重复生成：**已裁决（2026-11-22）** 不覆盖，新增一条产物，文件名依次追加 `-2`、`-3`（如 `报告.pdf`、`报告-2.pdf`、`报告-3.pdf`），两条产物 id 不同且首条内容不变。依据 Lead 2026-11-22 裁决。
- `Q-04` FILE-001 文件页入口：**已裁决（2026-11-22）** 入口固定在会话右栏「文件」标签，不在工作台另设独立文件页；条目数与本会话 `GET /api/sessions/{id}/files` 返回的 `files.length` 一致。依据 Lead 2026-11-22 裁决。
