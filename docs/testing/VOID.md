# 作废截图清单（docs/testing）

移入位置：`.trash/docs-testing/`（工作区内，未删除、未移出工作区）。

| 文件 | 作废原因 |
|---|---|
| `20261121-121619-before-app-1280.png` | Chrome 错误页（`ERR_CONNECTION_REFUSED`），截图目标错误 |
| `20261121-121619-before-app-1600.png` | 同上 |
| `20261121-121619-before-gallery-1280.png` | 同上 |
| `20261121-121619-before-metrics.json` | 同上（页面未加载，指标无效） |
| `20261121-121708-before-app-1280.png` | 应用已加载但库内 0 条消息，空态数据，与正式改前截图重复 |
| `20261121-121708-before-app-1600.png` | 同上 |
| `20261121-121708-before-gallery-1280.png` | 同上（hash 未生效，截到 app） |
| `20261121-121708-before-metrics.json` | 同上（0 消息空态） |

## 时间戳口径

- 旧文件名 `20261121-121733-*` / `20261121-123009-*` 是 **UTC**（未带 `Z`）：前者 = 本地 2026-11-21 20:17:33 +08:00，后者 = 20:30:09 +08:00。
- 自本次收尾起，`docs/testing/capture-snapshot.mjs` 的文件名统一追加 `Z`（例 `20261121-123500Z-*`），并在 metrics JSON 写入 `capturedAt`（ISO UTC）与 `timezone`。
