# <P域> · <能力域名> 测试计划

> 模板：复制到 `specs/test/<P*-*>/test-plan.md`。一能力域一份；用例按 PRD 分节，不按功能点建文件。
> 规则见 `$DSH_HOME/rules/spec-workflow.md` 与 `$DSH_HOME/rules/agent-development.md`。

状态：**active（骨架；未执行）** — 本文件定义用例与证据口径，不代表已经通过。

> 产品域 spec：`specs/product/<P*-*>/spec.md`；功能树：[`TREE.md`](../../docs/product/TREE.md)；
> 追溯：[`TRACEABILITY.md`](../../docs/product/TRACEABILITY.md)。

## 1. 范围

- 覆盖的 PRD：`PRD-<DOM>-001` …；
- 不在本计划内的：跨域 E2E 放 `specs/test/e2e/`；组件契约放 `specs/COMP-*`；
- 测试层级：unit / component / integration / E2E；说明本域哪层为主、哪层暂缺。

## 2. 环境与数据

| 项 | 值 |
|---|---|
| 运行方式 | 本地构建 / 浏览器 / 后端服务 |
| 数据来源 | 固定 fixture / mock / 临时数据库；禁止依赖真实用户数据 |
| 时间与区域 | 固定时区、固定窗口，避免“今天”造成波动 |
| 清理 | 每个用例独立准备与清理 |

## 3. 用例

> 每个用例必须写：对应 PRD、前置、步骤、断言、层级、当前证据。
> 证据只能是：`missing`、`skipped（原因/owner）`、`命令 + 通过/失败 + 日期`、截图/日志路径。
> 不得把“测试计划文件存在”当作 `passed`。
> 时间类用例须写明推进量与推进方式，并写清推进后期望发生与不期望发生的行为；判据写法见 [`domains/testing.md`](https://github.com/YJM1024/moxian-framework/blob/main/docs/framework/domains/testing.md) 的 MX-QA-70。

### PRD-<DOM>-001 · <功能点名称>

| 用例 ID | 前置 | 步骤 | 断言 | 层级 | 当前证据 |
|---|---|---|---|---|---|
| `TC-<P域>-001` | | | | integration | `missing` |

### 边界与异常用例

| 用例 ID | 对应 PRD | 前置 | 步骤 | 断言 | 层级 | 当前证据 |
|---|---|---|---|---|---|---|
| `TC-<P域>-E1` | | 空数据 | | 有可见空态，不显示假 0 | component | `missing` |
| `TC-<P域>-E2` | | 接口失败 | | 有错误态/重试，不静默 | integration | `missing` |
| `TC-<P域>-E3` | | 权限不足/隔离 | | fail-closed，无越权入口 | integration | `missing` |

## 4. 覆盖统计

| 项 | 计划 | 已执行 | 通过 | 说明 |
|---|---:|---:|---:|---|
| PRD 主用例 | | 0 | 0 | |
| 边界用例 | | 0 | 0 | |
| 自动化覆盖 | | 0 | 0 | 只统计可复现证据 |

> 禁止把未执行写成 100%；覆盖率只做趋势，不作为“功能已覆盖”的唯一证据。

## 5. 发布门禁

- 所有 P0 PRD 主用例有通过证据；
- 空/错误/权限边界至少各一条通过证据；
- 无 `skip` 未说明原因与 owner；
- 证据链接可打开、命令可复现；
- 与产品 spec AC、TRACEABILITY 的 TEST 列一致。

## 6. 变更记录

| 日期 | 变更 | 变更包 | 影响用例 |
|---|---|---|---|
| | | | |
