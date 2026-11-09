# M12 实现契约：文件生成 + 联网（web_search / web_fetch），浏览器另列 M12b

> 前置：M11（会话工作台）完成。原则：能自研就不引依赖；不能自研的用本机已有组件（Chrome/Python）。

## 1. 文件生成（写入 artifacts，走审批）

| 工具 | 输入 | 实现 | 风险/审批 |
|---|---|---|---|
| `make_pdf` | `html` 或 `markdown`, `title?`, `filename?` | 生成临时 HTML → **Chrome headless `--print-to-pdf`** → `artifacts/<session>/<name>.pdf` | 写/执行 → ask |
| `make_docx` | `markdown` 或结构化 blocks, `filename?` | 调用自带 Python（python-docx）helper 脚本 | ask |
| `make_xlsx` | `sheets:[{name,rows[][]}]`, `filename?` | openpyxl helper | ask |
| `make_pptx` | `slides:[{title,bullets[]}]`, `filename?` | python-pptx helper | ask |
| `make_image` | `prompt`（文本绘图占位）或 `svg`/`png` 输入 | Pillow 生成/处理 | ask |

- 统一返回：`{ok,artifact:{id,name,mime,size,path,previewUrl,downloadUrl}}`；
- 落盘目录：`SIMO_HOME/artifacts/<sessionId>/`；文件名净化；大小上限（PDF/图片 ≤20MB）；
- 依赖发现：Chrome 路径（`tools.chrome` 配置，默认探测 Program Files）、Python 路径（`tools.python`，默认自带）；缺失时返回清晰错误，不静默降级；
- **不执行宏/脚本**；HTML 输入做基本净化（禁 `<script>`）。
- 错误即数据：`Error: <code>` + recovery hint，不结束 turn。

## 2. 联网

### 2.1 `web_search`
- 输入：`query`, `count?`（≤10）；
- 实现：DuckDuckGo HTML（`https://html.duckduckgo.com/html/?q=`）优先，失败回退 Bing HTML；解析标题/URL/摘要；
- 返回：`{results:[{title,url,snippet}], source}`；
- 超时 15s；网络错误返回结构化错误。

### 2.2 `web_fetch`
- 输入：`url`, `max_bytes?`（≤2MB）, `format?`（text/markdown）；
- 仅允许 `http/https`；拒绝内网/环回地址（SSRF 防护：127.0.0.0/8、10/8、172.16/12、192.168/16、::1、link-local）；
- HTML → 正文文本（去脚本/样式/导航，简单 readability）；超限截断；
- 返回：`{ok,url,status,contentType,text,truncated}`；
- 结果保存为会话内可引用内容（不自动落盘）。

## 3. 权限与审批

- 网络工具在 `auto` 策略下**首次/每域名**进入 ask，可"本会话允许"；`never` 下拒绝；
- 文件生成工具（写盘）走 ask；
- 审计：`tool.call` 记录 url/域名/大小、生成文件路径；
- 默认 `workspace-write + auto` 不变。

## 4. 前端

- 生成文件：复用交付物卡片/文件选项卡；预览 PDF/图片、下载；
- 联网：工具调用卡片显示搜索/抓取摘要与来源链接（可点击，`rel=noopener`）；引用来源展示；
- 不新增重型 UI；不引入第三方 markdown/UI 库。

## 5. 验收（M12）

1. "把这份总结导出成 PDF" → 生成 PDF，可下载/预览，内容正确（中文）；
2. `make_docx`/`make_xlsx`/`make_pptx` 各生成一个可打开文件（Python 自检）；
3. `web_search "今天天气"` 返回 ≥3 条结果；`web_fetch` 抓一个公开页面返回正文；
4. SSRF：`http://127.0.0.1`、`http://169.254.169.254` 被拒；
5. 审批：网络/写盘 ask；never 拒绝；审计可见；
6. `go vet/test`、`tsc`、构建、M1–M11 evals 全绿 + M12 新 case。

## 6. 边界

- M12 只做 HTTP 搜索/抓取，不做浏览器自动化（M12b：MCP + Playwright 用已装 Chrome）；
- 不做 Office 在线预览（下载/系统打开）；
- 不引第三方搜索 API key（可用 HTML 解析，质量有限，后续可配 key）。
