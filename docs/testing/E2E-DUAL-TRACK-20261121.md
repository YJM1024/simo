# E2E 双轨处置建议（C-15）— 2026-11-21

## 结论（阶段 1 唯一证据）

- **阶段 1 唯一 E2E 证据 = CDP runner 19/19**：`frontend/e2e/report/cdp/summary.md`，2026-11-21T05:14:41Z，`19/19 passed, 0 failed`；其中 `07` 交付物下载是 P2 OOS，默认 SKIPPED，不计入本阶段通过范围。
- **Playwright 11 例为 legacy，未跑通**：`frontend/e2e/specs/` 下 7 个 spec 文件，实测 `test(` 共 11 个（01:2、02:1、03:1、04:4、05:1、06:1、07:1）。受限会话里 Playwright worker 以命名管道 fork 被拒（`Error: spawn EPERM at WorkerHost.startRunner`），该套件从未完整执行成功，不得作为阶段 1 证据。
- `frontend/e2e/README.md` §4.1 历史文字写“16 条”，与现状 11 条不符；已在 README 顶部加证据口径说明，**未删除任何文件**。

## 建议处置（需验收 Agent / 用户裁决，我不执行）

1. **证据门禁按通道区分**：阶段 1 的 E2E 放行只认 `pnpm test:e2e:cdp` 的 19 场景报告（含 `results.json`），任何“E2E 通过”必须标注通道与报告路径；不把 Playwright 结果写入门禁。
2. **Playwright 套件保留为 legacy，不删不移**：在 `frontend/e2e/README.md` 维持 legacy 标注；CI 暂时不要把 `pnpm test:e2e` 设为阻塞项（`frontend/e2e/.github/workflows/e2e.yml` 目前仍跑它，且 README §7 已注明未实跑验证）。
3. **阶段 2 二选一**（开新 change，不在本轮做）：
   - A. 在普通 Windows/CI 实跑并修通 11 例，恢复双轨；或
   - B. 把 11 例中仍有价值、CDP 未覆盖的断言迁入 `cdp-runner.mjs`，Playwright 套件冻结为历史资产。
4. **计数单一事实源**：若后续维护 legacy 套件，把“11 例”写进测试 spec 或 README，不再使用 16；新增/删除用例时同步更新报告。

## 未验证 / 限制

- 本轮没有重跑 CDP 19/19，也没有尝试启动 Playwright（fork 限制依旧）；上述 19/19 引用的是仓库内既有报告，不是本轮新证据。
- 未改 CI workflow、未删/移任何 E2E 文件；处置建议须由验收方决定后另行实施。
