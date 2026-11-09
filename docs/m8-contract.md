# M8（V1.1）实现契约：富文本消息 + 文件上传

> 前置：V1（M1–M7）已交付。设计依据：design/10 §41、design/14（三栏/气泡）、现有 `platform/markdown`（产物预览）与 chat 模块。
> 原则：**Markdown 子集 + 自研渲染 + 不引入第三方编辑器/UI 库**。

## 1. 消息格式

> 模型侧要求：chat 的 system prompt 必须明确要求"回复用 Markdown 排版（列表/代码块/粗体/简单表格，禁用原始 HTML）"，否则模型默认输出纯文本，前端渲染无事可做。

- `messages.text` 语义统一为 **Markdown 子集**（用户输入与秘书回复一致）。
- 支持语法（渲染侧必须覆盖）：
  - 标题 `# / ## / ###`
  - 粗体 `**x**`、斜体 `*x*`
  - 无序列表 `- `、有序列表 `1. `
  - 行内代码 `` `x` ``、代码块 ``` ```
  - 引用 `> `、链接 `[t](url)`、分隔线 `---`
  - 简单表格（`| a | b |` + 分隔行）
  - 换行（段落/软换行）
- **安全**：
  - 原始 HTML 一律转义（不得注入 DOM）；
  - 链接仅允许 `http:`/`https:`（其它协议渲染为纯文本）；
  - 代码块不执行、不加载外部资源；
  - 不做 Markdown 内嵌图片渲染（V1.1 不引入外部图片拉取）。

## 2. 输入（Composer）

- 保持 `<textarea>`（Markdown 源），新增工具栏：**粗体 / 斜体 / 无序列表 / 有序列表 / 行内代码 / 代码块 / 链接**。
- 快捷键：`Ctrl+B` 粗体、`Ctrl+I` 斜体；`Enter` 发送、`Shift+Enter` 换行；列表行回车自动续 `- ` / `n. `。
- 工具栏插入包裹选区（无选区时插入占位文本并选中）。
- 发送后清空；输入中始终可用（含流式/任务运行中）。

## 3. 文件上传

### 3.1 上传端点（后端）

- `POST /api/uploads?sessionId=<id>`：`multipart/form-data`，字段名 `file`（可多次）。
- 限额：单文件 ≤ **20 MiB**、单条消息 ≤ **5** 个附件；超限 413/400 + 统一错误信封。
- 存储：`AGENTD_HOME/workspace/uploads/<sessionId>/<attId>-<safeName>`；文件名净化（去路径分隔符/控制字符），禁止 `..` 与绝对路径。
- 返回：`{ok:true, attachments:[{id,name,mime,size,createdAt}]}`。

### 3.2 发送消息带附件

- `POST /api/chat` body 增加可选 `attachments: ["<attId>", ...]`；WS `chat` 帧同样支持。
- 后端把附件关联到该 user message（表 `message_attachments`，chat 迁移 v4）。
- `GET /api/messages` 的每条消息增加 `attachments: [{id,name,mime,size,createdAt}]`（无则空数组）。
- 模型可见内容：用户正文后附
  ```
  [附件] <name> (<mime>, <size>) → workspace/uploads/<session>/<file>
  ```
  模型可用 `read_file` 读取（受 workspace 权限约束）。

### 3.3 下载/预览

- `GET /api/uploads/{id}` → 内容 + `Content-Disposition`；`GET /api/uploads/{id}/meta`。
- 路径必须限定 uploads 根（防穿越），只读；MIME 白名单仅影响 `Content-Type`，不阻止下载。
- 前端：文本/图片可预览，其它给下载；**不复制文件**。

## 4. 前端结构

- `platform/markdown.ts`：把现有产物预览的极简 Markdown 解析器抽出/扩展为共用（支持上述语法 + 安全转义），供消息与产物共用。
- `features/chat/MarkdownMessage.tsx`：渲染 agent/user 消息（禁用原文 HTML、链接 rel/noopener）。
- `features/chat/Composer.tsx`：工具栏 + 快捷键 + 列表续行 + 附件按钮/拖拽/粘贴文件；附件 chips（名称/大小/删除）。
- `features/chat/attachments.ts`：上传（fetch multipart）、附件元数据、错误提示。
- 模块化：不跨 feature import；Markdown 渲染在 platform。
- 可访问性：工具栏按钮有 `aria-label`/`title`，附件 chip 可键盘删除。

## 5. 后端结构

- `internal/modules/chat`：uploads handler、attachments 仓储、消息关联；限制与错误信封。
- 表：`message_attachments(id, message_id, upload_id, name, rel_path, mime, size, created_at)` + `uploads(id, session_id, name, rel_path, mime, size, created_at)`（迁移 chat v4）。
- 测试：上传限额/净化/穿越、附件关联、消息返回、重启持久化、M1–M7 evals 不回归。

## 6. 验收（M8）

1. 输入 `1. 第一\n2. 第二` 发送 → 气泡渲染为有序列表；`- a\n- b` → 无序列表；
2. 秘书回复含列表/代码/表格 → 正确渲染，**原始 HTML 被转义**；
3. 上传 1 个文件（≤20MB）→ 消息显示附件 chip → 下载可用；>20MB 被拒；
4. 下载/附件路径穿越被拒；附件关联到正确消息，会话隔离；
5. 重启后附件与消息不丢；
6. `go vet/test`、`tsc --noEmit`、构建、模块度、M1–M7 evals（30 条）全绿 + M8 新 case。

## 7. 边界

- 不做 WYSIWYG、不做外部图片渲染、不做在线 Office 预览；
- 不做附件解析入库（V1.1 只存文件 + 元数据）；
- 不引入第三方 Markdown/编辑器库。
