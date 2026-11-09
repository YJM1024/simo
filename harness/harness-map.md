# DSH「造一个自定义 agent」机制地图（当前 desktop profile）

> 生成时间：2026-11-03；目标 profile：`E:\dsh_home\profiles\desktop\`
> 实现 checkout（Desktop 版，只读）：`E:\dsh\resources\app.asar\dsh\`
> 标注约定：**[码]** = 读实现/README/配置原文确认；**[技]** = 本会话加载的技能文档规定；**[推]** = 由上述证据推断、未实机验证（GUI 文案、热加载效果、安装副作用）。
> 本机 `pwsh` 不可用（`SetNamedSecurityInfoW failed (Win32 5): grantWrite(E:\dsh_home\workspaces\agent)`，实测），所有读写都靠 `read/write/edit` 工具；`app.asar` 内的路径**只有** file-read 工具能读，shell/glob/grep 都不行。

---

## 0. 一句话结论

**"agent preset" 不是磁盘上的目录，而是一条 `@deepseek-ai/dsh-agent-preset` 的 Loader 行**：它的 `config.plugins` 是一份"这个 agent 专属的子插件清单"（工具、人格、prompt 段、委派后端、压缩策略…）。新建自定义 agent = **写一个 bundle（`package.json` + `cordis.patch.yml`）→ 用 `plugin_manager install_bundle` 装进 profile → 在 GUI / profile patch 里选它**。没有"扫描某个 presets 目录"这回事（旧的 `$DSH_HOME/.agent-presets/` 已废弃，本机 `E:\dsh_home` 下也确实不存在该目录 **[码]**）。

当前会话运行在 **`cordis` preset（Creator 模式）** —— 因为 `tool-cordis` 只在该 preset 里挂载，且技能里带 `@deepseek-ai/dsh-agent-preset/skills` 的 `customSkillDirs` **[推，强证据]**。

---

## 1. 「agent preset」的准确定义

### 1.1 三个角色

| 角色 | 包 | 职责 |
|---|---|---|
| 定义行 | `@deepseek-ai/dsh-agent-preset` | 声明一条 preset：`config.id` + `config.plugins`。注册即**立即（eager）激活**，失败也留在 roster 上并带诊断 **[码 README][码 inspect]** |
| 注册表 | `@deepseek-ai/dsh-agent-preset-registry` | 进程级服务 `ctx.agentPresets`：默认 preset、revision 保留/回收、把空白 session 绑定/换绑、对 GUI 暴露 `list`/`read`/`select` Remote **[码 Service 契约]** |
| 承载层 | bundle 的 `cordis.patch.yml` | 上述定义行**只能**由某个 bundle patch 插入/覆盖；profile 的 `cordis.patch.yml` 也可直接插（patch 层优先级最高）**[技][码]** |

### 1.2 权威字段契约（来自本机运行时 `agentPresets` Service 的 `PresetDefinition`）**[码]**

```ts
interface PresetDefinition {
  readonly id: string                    // 必需：preset 身份，小写字母/数字/连字符
  readonly name?: string                 // 可选：显示名
  readonly description?: string          // 可选：显示描述（也进 subagent 的 agent_preset 枚举提示）
  readonly order?: number                // 可选：roster 排序
  readonly plugins: readonly (Omit<EntryOptions,'id'|'disabled'> & {
    id?: string
    disabled?: EntryOptions['disabled'] | JsExpr
  })[]                                   // 必需：子插件行数组，可以为空数组
}
```

- 子行的 `id` **可省略**（Loader 自动分配）**[码 README]**；子行支持 `name`、`config`、`disabled`（布尔/`!!js`）、`group: true` + `name: cordis:group`（嵌套清单，可被 patch 按 id 插入）、`isolate`（服务 realm）、`inject` **[技]**。
- `config.id` 重复 → **声明加载失败** **[码 README]**。
- 空 `plugins: []` 的 preset 在 schema 上合法 **[码 Config schema：required 只有 id/plugins]**，但这样的 agent 没有任何工具和 prompt 段 —— 不是可用的 agent。

### 1.3 文件放哪

| 你要做的事 | 放哪 | 怎么生效 |
|---|---|---|
| 新 preset | **workspace 里自建 bundle 目录**（本次放在 `E:\dsh_home\workspaces\agent\harness\minimal-preset\`），两个文件：`package.json` + `cordis.patch.yml` | `plugin_manager` `install_bundle`（target=该目录绝对路径）→ 追加到 profile 的 `dsh.profile.bundles` |
| 改已发布 preset | 同上，但 patch 用**按行 id 覆盖**（`- id: preset-standard` …） | 同上 |
| 一次性/试验 | profile 的 `E:\dsh_home\profiles\desktop\cordis.patch.yml`，追加一个 `- insert:` 元素 | profile 配置默认热加载（见 §7.9）；写 profile 需审批 |
| 只给 CLI 启动的 profile 用 | CLI `--patch <yml>` 叠加层 | 仅对 `dsh --profile X --patch …` 生效，**GUI 不吃** |

### 1.4 最小可挂载骨架

已落盘：`E:\dsh_home\workspaces\agent\harness\minimal-preset\`

`package.json` **[技 规定了这两文件的形状]**：

```json
{
  "name": "@local/dsh-preset-demo",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "dsh": { "bundle": { "patch": "./cordis.patch.yml" } }
}
```

`cordis.patch.yml`（行名与 config 键全部抄自已发布的 web-app preset，可挂 **[码]**）：

```yaml
- insert:
    - id: preset-demo                     # Loader 行 id，约定 preset-<config.id>
      name: '@deepseek-ai/dsh-agent-preset'
      config:
        id: demo                          # 必需
        name: Demo                        # 可选
        description: Read-only recon agent.
        order: 20                         # 可选
        plugins:
          - id: persona
            name: '@deepseek-ai/dsh-persona'
            config:
              prefix: >-
                You are a meticulous reconnaissance agent. …
          - id: agent-instructions
            name: '@deepseek-ai/dsh-agent-instructions'
            config: { maxBytes: 65536 }
          - id: time-context
            name: '@deepseek-ai/dsh-time-context'
          - id: tool-fs
            name: '@deepseek-ai/dsh-tool-fs'
            config: { write: false, edit: false }   # 只读
          - id: tool-fs-search
            name: '@deepseek-ai/dsh-tool-fs-search'
            config: { sampleOverCapGlobResults: false }
          - id: tool-pwsh
            name: '@deepseek-ai/dsh-tool-pwsh'
            disabled: !!js process.platform !== 'win32'
          - id: tool-bash
            name: '@deepseek-ai/dsh-tool-bash'
            disabled: !!js process.platform === 'win32'
```

> `!!js` 只允许出现在 `config` 值和 `disabled` 上，按所属插件上下文求值 **[技]**；平台条件写法逐字抄自 `presets/standard.patch.yml` **[码]**。

### 1.5 host 与 preset 的分工（判据来自 web patch 的注释）**[码：`dsh-web-app\cordis.patch.yml` 第 460–589 行]**

| 归 Host（进程级/跨 session） | 归 preset（单个 agent 的能力） |
|---|---|
| 服务提供者：`tools`（工具注册表）、`system-prompt`（prompt 注册表）、`agent-loop`、`session`/持久化、`settings`、`sandbox-policy`、LLM 路由、`subagents` 注册表、`jobs` 注册表、`tokenMeter`、`goals`、`schedule`、`agent-teams`、`fs` | 工具行本身（`tool-fs`、`tool-pwsh`、`tool-web`…）、`persona`、`agent-instructions`、`time-context`、`plan-mode`、`compaction-*`、委派工具（`tool-subagent*`、`workflow-ptc`、`tool-workflow`）、`agent-tool-presentation`（native/PTC 呈现） |
| 需要 `inject: [某服务]` 的行（例：`shell-env` 因注入 `DSH_WEB_URL` 留 Host） | 被 preset 外部读取的服务若放进 preset，realm 外看不到 —— 这是"该服务归 Host"的判据（注释里用 goals/tasks/tokenMeter/subagents 举例） |
| 由 GUI/Remote 直接读的服务（team roster、job roster、agentPresets…） | preset 内**自己提供**服务时，provider 与 consumer 必须在**同一个 `cordis:group` + `isolate` realm** 里，否则激活审计报 leak/失败 **[技][码 registry README]** |

Web 面的事实：**base 层保有这些"一个 agent 的全部内容"的行，Web 面在 host 层把它们 `disabled: true`，改由 session 挂 preset 提供**（`tool-bash`、`tool-fs`、`tool-skill`、`tool-subagent*`、`workflow-ptc`、`tool-todo`、`tool-web`… 全在 web patch 里 disable）**[码]**。TUI/headless 仍走 host 平铺，所以两种形态共用同一批包。

---

## 2. 现有可参考的 preset / composition 示例（绝对路径）

### 2.1 已发布 preset（最好的模板）

| 路径 | 说明 |
|---|---|
| `E:\dsh\resources\app.asar\dsh\node_modules\@deepseek-ai\dsh-web-app\presets\minimal.patch.yml` | **最短、最适合抄**：persona + tool-fs（只开 readImage）+ compaction group + persistent shell group |
| `…\dsh-web-app\presets\standard.patch.yml` | 128 行，功能最全的"标准 agent"：工具全集 + plan-mode group + compaction group + delegation group（subagent/subagent_fork/workflow） |
| `…\dsh-web-app\presets\ptc.patch.yml` | 同 standard，但多了 `tool-presentation: { mode: ptc }`，并 disable 了 workflow 两行 —— **"同一个 agent 换工具呈现方式"的范例** |
| `…\dsh-web-app\presets\cordis.patch.yml` | **Creator 模式**：额外挂 `tool-cordis`，并用 `!!js` 动态解析 `@deepseek-ai/dsh-agent-preset/package.json` 求 `skills/` 目录塞进 `skill-filesystem.customSkillDirs` —— **"preset 挂 skill"的唯一范例** |

### 2.2 宿主层 / 其它 composition 示例

| 路径 | 说明 |
|---|---|
| `…\dsh-web-app\cordis.patch.yml` | 589 行，Web 面 host 层：详细注释解释"为什么这个行在 host / 为什么移进 preset"，以及末尾 `agent-preset-registry` insert |
| `…\dsh-web-app\package.json` | 看 `dsh.bundle.patch`（第 46–56 行）：**一个 bundle 可以挂多个 patch 文件**，preset 就是作为独立 patch 排在其后的 |
| `…\dsh-base\cordis.patch.yml` | 529 行，所有 profile 共享的 Host 底座（llm/session/agent/sandbox/tools/system-prompt…），理解"哪些行天然在 host" |
| `…\dsh-experimental-ralph-bundle\cordis.patch.yml` | 16 行，**最小 opt-in bundle 范例**：insert 一个带 `isolate` 的 group，里面挂 `workflow-ptc` + `tool-ralph` |
| `…\dsh-experimental-agent-team-profile\cordis.patch.yml` | 32 行，**team 能力**的挂载范例：先 disable 旧的 subagent 行，再 insert `agent-team` / `tool-agent-team` / `ui-agent-team` |
| `E:\dsh_home\profiles\desktop\package.json` | 本 profile 的 11 个 bundle（顺序即 patch 顺序） |
| `E:\dsh_home\profiles\desktop\cordis.yml` | 恒为 `[]`；注释说明"树 = bundle patches + cordis.patch.yml + --patch overlays" |
| `E:\dsh_home\profiles\desktop\cordis.patch.yml` | 用户 patch 层（最高优先级），当前 6 条覆盖：`agent-default-model`、`ui-settings-account`、`ui-chat`、`ui-settings`(关)、`ui-theme`、`subagent-model-selection-settings`、`subagent`(maxDepth/maxActiveSubagents=16) |
| `E:\dsh_home\profiles\desktop\pnpm-workspace.yaml` | profile 是个 pnpm workspace：`packages: [.]`、`nodeLinker: hoisted`、`autoInstallPeers: false`（安装 bundle 时 pnpm 就在这里跑） |
| `…\@deepseek-ai\dsh-agent-preset\README.md` + `skills\editing-cordis-compositions\SKILL.md` | 官方 preset 编写规程 |
| `…\@deepseek-ai\dsh-agent-preset\skills\cordis-composition-reference\references\packages.md` | **全量可挂插件包清单（生成物，514 行）**，写 preset 时按关键字 grep 它 |

---

## 3. 可安装插件包清单（按"造 agent"相关度）

> 全量清单：`E:\dsh\resources\app.asar\dsh\node_modules\@deepseek-ai\dsh-agent-preset\skills\cordis-composition-reference\references\packages.md`
> "本机已装"= 存在于 `E:\dsh\resources\app.asar\dsh\node_modules\@deepseek-ai\`（Desktop 安装自带，preset 行可直接 `name:` 引用，**bundle 不必声明依赖**）。

### 3.1 Subagent / 委派（**多 agent**，preset 可挑选）

| 包 | 能力 | preset 配置要点 | 本机 |
|---|---|---|---|
| `@deepseek-ai/dsh-subagent` | 委派 seam `ctx.subagents`（Host 层，已装） | — | ✅ host |
| `dsh-subagent-spawn-in-process` | 进程内**全新子 agent**（不继承对话） | 子 agent 继承父 cwd/模型；`agentPreset` 显式选 preset，省略则**加入父的当前 revision** **[码 README]** | ✅ host |
| `dsh-subagent-fork-in-process` | 进程内 **fork 子 agent**（继承已完成轮次） | fork 不支持选 preset/选模型 | ✅ host |
| `dsh-subagent-acp` / `-claude-code` / `-codex` / `-dsh-sdk` | 外部后端（子进程/CLI） | 需另装 | ❌ 未装 |
| `dsh-tool-subagent` | 模型可见委派工具 | `provider`、`toolName`、`maxDepth`、**`agentPreset`（子 agent 默认 preset）**、**`allowedAgentPresets`（暴露成 `agent_preset` 枚举）**、`modelSelectionSettings`、`agentOptions{provider,model,reasoningEffort,maxTokens}` | ✅ |
| `dsh-tool-subagent-control` (+ `/list-agents`) | `send_message` / `interrupt_agent` / `list_agents` | — | ✅ |

### 3.2 Agent Teams（**多 agent / 团队**，本 profile 已在 **Host 层**挂载 → 每个 preset 的 agent 都有）

| 包 | 能力 | 配置 | 本机 |
|---|---|---|---|
| `@deepseek-ai/dsh-experimental-agent-team` | `ctx.agentTeams`：Lead + 具名 teammate + 直达消息 + 持久共享任务板（CAS revision） | `maxMembers:8`、`maxTasks:256`、`maxMessageBytes`、`disposalTimeoutMs` | ✅ host（行 `agent-team`） |
| `dsh-experimental-tool-agent-team` | 9 个工具：`spawn_teammate`/`send_message`/`list_agents`/`wait_agent`/`interrupt_agent`/`team_task_*` | `freshProvider:spawn`、`forkProvider:fork` | ✅ host（行 `tool-agent-team`） |
| `dsh-experimental-client-ui-agent-team` | Web roster / 任务板 UI | — | ✅（行 `ui-agent-team`） |
| 依赖 | **durable session storage**（`dsh-session-persistence-jsonl` 已装 ✅）、旧的 `tool-subagent*` 必须 disable（team 包用同名工具覆盖） | | |

> ⚠️ 因为 team 在 Host 层，**自定义 preset 无法关掉 team 工具**（要关只能改 profile patch 的 `disabled`）。

### 3.3 Workflow / Ralph / Schedule

| 包 | 能力 | 配置 | 位置 |
|---|---|---|---|
| `dsh-workflow-ptc` | JS 编排脚本引擎（`ctx.workflowEngine`，跑在 PTC 沙箱 Node） | `provider: spawn` | **preset**（standard/ptc/cordis 都在 `delegation` group 里挂） |
| `dsh-tool-workflow` | 模型可见 `workflow` 工具 | — | preset（同上） |
| `dsh-tool-ralph` | 新鲜 agent Ralph 循环工具 | `subagentProvider: spawn`、`maxRounds: 64` | **Host**（`optional-ralph` group，`isolate: workflowEngine`）→ 所有 agent 都有 |
| `dsh-schedule` | Host 级 durable 提醒服务 | — | Host（web patch 挂） |
| `dsh-tool-schedule` | `schedule_create/list/update/delete` | — | **preset**（standard/ptc/cordis 都挂） |

### 3.4 `tool-*` 系列（preset 里"挑工具"的原料）

`tool-bash` / `tool-bash-persistent` / `tool-pwsh` / `tool-pwsh-persistent` / `tool-fs`(`read/readImage/write/edit`) / `tool-fs-search`(glob/grep，`sampleOverCapGlobResults`) / `tool-web`(`fetch`、`searchTimeoutMs`) / `tool-todo`(`allowParallelInProgress`) / `tool-ask-user` / `tool-jobs` / `tool-goal` / `tool-skill` / `tool-present` / `tool-workspace-dependencies` / `tool-str-replace-editor` / `tool-session-query` / `tool-terminal`（6 个持久终端工具，Host）/ `tool-cordis`（运行时只读自省，仅 cordis preset）/ `tool-plugin-manager`、`tool-plugin-market`（在 `@deepseek-ai/dsh-plugin-manager/tools` 等子路径）。

### 3.5 其它"给 agent 加能力"的现成行

`persona`（人格）、`agent-instructions`（AGENTS.md/CLAUDE.md，`maxBytes`）、`time-context`、`harness-dev-context`（Host）、`plan-mode`、`compaction-basic`、`compaction-tool-result-pruner`、`compaction-image-offload`、`spill-policy`、`repeat-tool-reminder`（防重复调用）、`tool-call-timeout-policy`、`fs-observation-policy`、`agent-tool-presentation`（native/PTC）、`skill-filesystem`、`skill-office`/`skill-badge`（bundle skill）、`mcp-client`、`hooks-claude-code`/`hooks-codex`（把 CC/Codex 的 hooks 桥到本 Harness）。

---

## 4. 怎么挂载、怎么切换、怎么验证

### 4.1 三条挂载路径

**A. 新 bundle（推荐：可版本化、由 plugin_manager 管、profile 可回滚）**

```jsonc
// 工具调用（agent 侧唯一受支持的安装入口）
plugin_manager { "action": "install_bundle",
                 "target": "E:\\dsh_home\\workspaces\\agent\\harness\\minimal-preset" }
```
- 它自己跑 pnpm、写 profile 的 `package.json` + `cordis.patch.yml`/bundle 选择，然后热应用 **[技]**。
- 结果看返回的 `application` / `warnings`（`application: applied` 才算生效），**不要**看日志或进程列表 **[技]**。
- 需要 **Full access 或审批**。本会话审批被禁用 → 该调用会被自动拒绝（我无法在本会话里装）。
- 其它动作：`list_bundles`、`list_plugins`、`set_bundle`（启停）、`set_plugin`（`disabled` 翻转）。

**B. 直接写 profile patch（快，但绕过 bundle 管理；需审批）**

在 `E:\dsh_home\profiles\desktop\cordis.patch.yml` 末尾追加（该文件是顶层 YAML 数组，patch 层最后应用、优先级最高）：

```yaml
- insert:
    - id: preset-demo
      name: '@deepseek-ai/dsh-agent-preset'
      config:
        id: demo
        order: 20
        plugins: [ …同 §1.4… ]
```
注意：这个文件已有 6 条按 id 的覆盖行，**只能追加数组元素**，不要动既有行。

**C. 覆盖/派生已发布 preset（不新增，改现有 agent）**

```yaml
- id: preset-standard                        # 按 Loader 行 id 覆盖
  name: '@deepseek-ai/dsh-agent-preset'      # 断言原插件名，不改名
  config:                                    # ⚠️ config 整体替换，不深合并
    id: standard
    order: 1
    plugins: [ …必须把原 128 行清单完整重述并加上你的改动… ]
```

> `dsh --profile X --patch <yml>` 是第 4 种（只对 CLI 启动的 profile 生效）。

### 4.2 启动参数（CLI 侧，全部来自 `…\@deepseek-ai\dsh\lib\bin.js`）**[码]**

```
dsh <name>                                        # 等价 dsh --profile <name>
dsh --profile <name>                              # 启动 profile
dsh --profile <name> --patch a.yml --patch b.yml   # 追加 patch 覆盖层（可重复，每次只吃一个路径；启动器只解析自己的 flag，遇到第一个不认识的 token 之后原样交给 app）
dsh --profile <name> --dump-config                # 打印合成后的 profile 树（含用户 patch）
dsh --profile <name> --dump-default-config        # 不含用户层/--patch
dsh --profile <name> --dump-config-schema         # 只打印 schema
dsh <name> --from-default-profile web             # 用发布模板重建一个自定义 profile 再启动
dsh plugin --profile <name> add <pkg>             # 转发给 profile 目录里的 pnpm
```
- ⚠️ **`desktop` profile 被 CLI 拒绝**：`error: profile "desktop" is managed exclusively by the Electron application`（`bin.js` 第 35–37、112 行）。所以本 GUI 的 profile **不能**用上面命令观察，只能用 GUI / `plugin_manager` / `cordis_inspect_query`；CLI dump 请用另一个 profile（如 `dsh web --dump-config`）。
- **preset 没有启动参数**：选哪个 preset 是"会话级"的决定（见 4.3），不是进程级 flag。

### 4.3 切换（三种粒度）

| 粒度 | 怎么做 | 说明 |
|---|---|---|
| **默认**（之后新建的会话） | GUI：`设置 → 通用/General → Agent preset` 卡片组，点选卡片设为默认 | 写 `agent-preset-registry` 的 settings 命名空间 `selectedDefault`（覆盖部署值 `default: standard`）**[码 registry README][推 GUI 文案]** |
| 同上（无 GUI） | profile patch 覆盖 `- id: agent-preset-registry` 的 `config.default` | ⚠️ 整体重述 config |
| **单次新会话** | 新任务输入框的 preset 选择器；`设置 → … → Creator` 或用 Plugins 页 `Add plugin ▾ → Let the agent create a plugin` 会自动把当前空白会话切到 `cordis` preset | 只有**空白会话**能切；`agentPresets/select` Remote 就是这个动作（`select(agent, agentPreset)`，已在跑首轮的会话不改）**[码 README + Service 契约]** |
| **子 agent** | preset 的 `tool-subagent` 行配 `agentPreset` / `allowedAgentPresets`；不配则子 agent 继承父的当前 revision | **fork 后端不支持**；`allowedAgentPresets` 非空且必须包含 `agentPreset` **[码 README]** |

> Coding Tools 关闭时 roster 只提供 Standard / Creator / 自定义；打开后才出现 PTC / Minimal。已存在会话保持自己的选择，新建会话用当前默认 **[码 ui-agent-preset README]**。

### 4.4 验证（从"结构生效"到"行为生效"，按可靠性排序）

1. **结构（无需审批，任何会话可做）** —— 本次实测可用的入口：
   ```
   cordis_inspect_query(host, "Config", "listConfigs",
                        {"name": "@deepseek-ai/dsh-agent-preset"})
   ```
   装前实测返回 4 条（`include:preset-standard/ptc/minimal/cordis`）。装成功后应出现 **第 5 条**：
   `{"id":"include:preset-demo","patchId":"preset-demo","name":"@deepseek-ai/dsh-agent-preset","status":"schema"}`。
   再查一次 `{"entry":"include:preset-demo"}` → 返回 `packageDir` + 完整 config schema；若该行激活失败，`status`/`limitations` 会变（roster 上也会带 `broken` 诊断）。
   > `status` 取值含义：`schema` 有 Config schema；`tree` 是 group；`inactive` 行被 disable；`absent` 挂载但无 Config schema。**`absent` 不等于没挂**。
2. **安装侧**：`plugin_manager {action:"list_bundles"}` 有该 bundle；`{action:"list_plugins"}` 有 `preset-demo` 行、`enabled:true`、`fiberPhase` 为 active。`overridden` 表示被更高优先级层压掉。
3. **roster 侧**：GUI 设置页 Agent preset 出现 "Demo" 卡（可点 "View configuration" 看只读 YAML —— 失败 preset 也能读，诊断指向 YAML）。
4. **行为侧（唯一能证明"新 agent 生效"）**：把默认或空白会话切到 `demo`，**新建**一个会话，确认：
   - 工具集 = preset 列的行（这里应只有 read/read_image/glob/grep + 一个 shell，**没有** write/edit），可用 `cordis_inspect_query(host,"Tool","listTools")` 在该会话里看；
   - 人格文字生效（首条 system prompt 的 persona 段）；
   - 会话标签/记录里的 preset id = `demo`（registry README：session log 会保留 preset ID）。
5. **反向验证（快速回归）**：`plugin_manager set_bundle {target, enabled:false}` 后重查 §4.4.1，应回到 4 条。

> 本次**未执行**的真实安装：本会话审批禁用，`install_bundle` 会被拒；`pwsh` 也因沙箱 ACL 不可用。§4.4.1/3 的"装前"状态是我实测的，"装后"结果按上述断言给出，供 Lead 用 Full access 一次跑通。

---

## 5. 自定义 agent 的能力边界

| 能力 | 能做吗 | 怎么做 / 现成机制 |
|---|---|---|
| **挑选/禁用工具** | ✅ 完全可控 | 只列想要的工具行；或 `disabled: true` / `!!js` 条件；再往下用子行 `config` 精调（`tool-fs{read,readImage,write,edit}`、`tool-web{fetch}`、`tool-todo{allowParallelInProgress}`、`tool-fs-search{sampleOverCapGlobResults}`…）。**没有** `toolFilter` 之类的语法：`tool-subagent` 里塞 `persona`/`toolFilter` 会以迁移错误拒绝加载 **[码 README]** |
| **工具呈现方式** | ✅ | `@deepseek-ai/dsh-agent-tool-presentation` + `mode: ptc`（见 `presets/ptc.patch.yml`），native 为默认 |
| **系统提示词/人格** | ✅ | `persona{prefix,suffix,complete,includeRuntimeContext}`（`complete:true` = 整段 system prompt 只由 prefix 构成）；+ `agent-instructions`(AGENTS.md)、`time-context`、`harness-dev-context`(Host)。⚠️ persona 只能在 preset 里挂（挂 Host 会与 prompt 注册表冲突并失败）；部署级人格在 `system-prompt` 行 |
| **绑定模型** | ❌ preset 没有 model 字段 | 进程级默认 = Host `agent-default-model`（本 profile patch 已改成 `deepseek-account/deepseek-flash/effort=high`）；会话级 = GUI `/model`。preset 只能给**子 agent** 定路由：`tool-subagent.agentOptions{provider,model,reasoningEffort,maxTokens}` + `modelSelectionSettings`（本 profile 已开，允许 deepseek-flash） |
| **挂 skill** | ✅ | `skill-filesystem.customSkillDirs` 追加目录 + `tool-skill` 暴露 `skill` 工具；skill 注册表是 host+per-scope 分层，preset 自己有独立层。**范例**：`presets/cordis.patch.yml` 第 122–129 行用 `!!js` 解析 `@deepseek-ai/dsh-agent-preset` 的 `skills/` 目录 |
| **挂事件监听/拦截** | ✅ 但需写插件 | preset 行本质是"插件行"，所以可以挂任何"监听型"已装包：`repeat-tool-reminder`、`tool-call-timeout-policy`、`fs-observation-policy`、`plan-mode`、`compaction-*`、`hooks-claude-code`/`hooks-codex`；要自定义逻辑就自写插件包（行 `name` 支持相对路径，**相对路径以 patch 文件为锚**），行还支持 `inject` / `intercept` / `isolate` **[技]** |
| **复用团队/多 agent 能力** | ✅（部分在 Host 层，无法按 preset 关） | 见 §3.1–3.3：`subagent`/`subagent_fork`/`workflow`/`tool-schedule`/`tool-todo` 等由 preset 决定；`team`9 件套、`ralph`、`terminal`、`jobs 注册表`、`goals` 在 Host 层 → **所有 preset 共享** |
| **多份同时存在** | ✅ | 一个进程可挂多个 preset；registry 对每个 revision 只 eager 激活一次，所有 agent 共享 Host 的 agent loop。改动只影响**之后新建**的 agent/session（KV cache 稳定） |

---

## 6. 建议的 preset 放置位置

1. **作者目录（源）**：`E:\dsh_home\workspaces\agent\harness\<name>-preset\`（本次已建 `minimal-preset\`）。放在 workspace 的原因是：可被 review、可 diff、可重装；`install_bundle` 只要求"绝对目录路径"。
2. **落盘位置（安装后）**：由 `plugin_manager` 决定 —— profile 的 `E:\dsh_home\profiles\desktop\package.json` 的 `dsh.profile.bundles` 追加包名，包体进 `E:\dsh_home\profiles\desktop\node_modules\@local\...`（hoisted）。**不要手写这两个位置。**
3. **不要**放到 `E:\dsh\resources\app.asar\dsh\`（只读安装目录）或新建 `$DSH_HOME/.agent-presets/`（已废弃，无人读取）。

---

## 7. 坑（按踩中概率排序）

1. **版本门槛**：全部包统一 `0.2.1-rc.2`；`@deepseek-ai/cordis ~4.0.5`、`cordis-plugin-loader ~1.0.6`、`cordis-plugin-include ~1.0.10`。bundle 的 `engines.dsh` 或对 `@deepseek-ai/dsh*` 的 peerDependency **不满足会直接拒装/拒激活** —— 自写 bundle 最好什么都不声明（随安装解析）**[技]**。
2. **模块解析**：已发布包从 **dsh 安装目录**解析，profile 的 `node_modules` 只放"用户装的 bundle"。所以 preset 行里引 `@deepseek-ai/dsh-tool-fs` **不需要**在 bundle 里声明依赖；反过来，**未安装**的包（如 `dsh-subagent-acp`、`dsh-web-search-exa`）写进去会在激活时报找不到模块 **[技][码：packages.md 标注 vs 本机 deps]**。
3. **`config` 是整体替换，不是深合并**：覆盖任何既有行（含 `preset-standard`）都必须重述该行原本的**全部**字段（web patch 注释反复强调）**[码]**。
4. **preset id / 子行 name 冲突**：`config.id` 重复 → 声明加载失败；同一 scope 内工具名全局唯一（例如一个 preset 里别放两个 `toolName: subagent`；`list_subagent_models` 全场只能有一个 owner）**[码 README]**。
5. **preset 坏了不会崩进程，但会挡住新会话**：失败的定义仍留在 roster 上带诊断、不能 compose 新 session；改好后重装即可；**已存在的会话/子会话保留旧 revision**，必须开新会话才算验证 **[码]**。
6. **服务放错平面**：preset 里提供服务的插件必须和消费者同处一个 `cordis:group` + `isolate` realm，否则激活审计判 leak 并拒绝挂载；`agentPresets.serviceFor()` 是唯一显式跨 realm 读的口子 **[码]**。
7. **`persona` 不能在 Host 层挂**（与 `system-prompt` 的 `deployment:persona-prefix` 注册冲突，会 fail loud）；它存在就是为了"替某个 agent 遮蔽部署人格" **[码]**。
8. **安装需要 Full access/审批**：每次 `plugin_manager` 调用（连 `list_plugins`）都要 `danger-full-access` 或审批；本会话审批被禁用 → 一律自动拒绝。装 bundle 会在 Host 进程里执行插件代码，风险等级就是这么定的 **[技]**。
9. **热加载边界**：Host 侧 profile 配置默认会热重载（`hmr` 行、`config.root: []`，"profile configuration reloads by default; module roots are opt-in"），但 **preset 的改动只影响新 agent**；client 插件改动还要 `pnpm run dev:web` 才会无刷新重载（本机是 Desktop 安装包，不适用） **[码 base patch 注释][技]**。
10. **`desktop` profile 不能用 dsh CLI**（独占 Electron）；CLI 的 `--dump-config` 只能验别的 profile。GUI 里改的东西想从 CLI 看，需另建 profile。
11. **app.asar 的读法**：`E:\dsh\resources\app.asar\dsh\...` 只能用 `read`（Host 进程自己读）；shell / glob / grep / node 全部打不开。所以本文档里 asar 内的路径都靠 `read` 逐文件确认。
12. **`pwsh` 沙箱 ACL 故障**：本会话 `pwsh` 直接报 `grantWrite(E:\dsh_home\workspaces\agent)`；不要依赖 shell 做验证（`diagnose-windows-sandbox-acl` 技能可修，但那是另一件事）。
13. **不要手写 profile 文件**：`plugin_manager` 会做 pnpm install + bundle 选择 + 写 package.json；手写 profile 的 `package.json`/`cordis.patch.yml`、在 profile 里跑 pnpm、把包丢进 `$DSH_HOME` 都属"各自需要单独审批"的越界操作 **[技]**。
14. **团队/多 agent 的边界**：team 只有一个共享 cwd、成员共享进程；没有 worktree/合并/文件锁；`writeScopes` 只是**告警**不阻塞；`bash`/格式化器可绕过版本守卫，Lead 必须自己 review diff 并跑测试 **[码 agent-team README]**。

---

## 8. 一页操作流程（Lead 可直接照做）

```text
1) 复制骨架：E:\dsh_home\workspaces\agent\harness\minimal-preset\
   改 config.id（避免与 standard/ptc/minimal/cordis 冲突）、name、persona.prefix、plugins 清单
2) plugin_manager { action:"install_bundle", target:"E:\dsh_home\workspaces\agent\harness\minimal-preset" }
   → 只有返回 application:"applied" 才算装好
3) cordis_inspect_query(host, Config, listConfigs, {"name":"@deepseek-ai/dsh-agent-preset"})
   → 期望出现 include:preset-demo / patchId=preset-demo / status=schema
   → 再查 {"entry":"include:preset-demo"} 拿 schema，确认无 broken
4) GUI 设置 → General → Agent preset：看到 Demo 卡；设为默认（或新建任务时选它）
5) 新建一个会话 → 在该会话里 Tool.listTools 应等于 preset 的工具集；persona 生效
6) 回滚：plugin_manager { action:"set_bundle", target:"@local/dsh-preset-demo", enabled:false }
```

## 9. 证据等级汇总

| 结论 | 等级 |
|---|---|
| preset = Loader 行、字段契约、空 plugins 合法 | **[码]** 运行时 `PresetDefinition` 类型 + `Config.listConfigs` schema |
| 4 个已发布 preset 的行结构与配置键 | **[码]** 4 个 `presets/*.patch.yml` 原文 |
| host/preset 分工判据 | **[码]** `dsh-web-app/cordis.patch.yml` 460–589 注释 + base patch |
| 本 profile 的 bundle 列表、patch 覆盖、pnpm workspace 设置 | **[码]** 4 个 profile 文件 |
| CLI 参数、desktop profile 被拒 | **[码]** `@deepseek-ai/dsh/lib/bin.js` 26–137 行 |
| `agentPresets` 服务契约（register/list/read/select/mount/composeFrom…） | **[码]** cordis_inspect_query Service 结果 |
| subagent 的 `agentPreset`/`allowedAgentPresets`/`agentOptions` 语义 | **[码]** 两个 README |
| team / ralph / terminal 在 Host 层（所有 agent 共享） | **[码]** 对应 bundle patch + Config roster 状态 |
| 装 bundle 后的落盘位置与 hot-apply 细节 | **[技]** + **[推]** |
| GUI 的入口文案与位置（设置页卡片、新会话选择器、Creator 入口） | **[推]（来自 ui-agent-preset README，本会话无浏览器控制权，未逐字核验）** |
| 装后行为（新会话工具集变化） | **[推]** 未实机执行（审批禁用） |
