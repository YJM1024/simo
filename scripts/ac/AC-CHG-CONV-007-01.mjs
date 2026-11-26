// AC-CHG-CONV-007-01 · 变更级提交后 5 秒内出汇总卡、详情可开、下载字节一致、三档不溢出
//
// 判据（specs/contract/CONV/contract.md CT-CONV-539）：
//   - 提交后 5 秒内出现汇总卡；厚卡与详情可打开；
//   - 交付物下载字节等于响应 size；
//   - 375/768/1280 三档 scrollWidth 不大于视口。
//
// 只读夹具的边界：本脚本不提交消息（提交会写真实后端，且 mock 模型不会产出任务批次）。
// 「5 秒内」按可观测等价物取证：批次消息已在会话里，测「页面导航开始 → 汇总卡可见」的
// 渲染延迟，上限仍是 5000ms；提交链路本身不在本脚本覆盖范围，证据里注明。
//
// 场景：scripts/ac/lib/conversation-fixture.mjs（batchId=b-1、10 条任务、d1 2048 字节）。
//
// 下载口径：右栏「交付物」页的下载控件是按钮（aria-label「下载 …」），点击后
// window.open(downloadUrl) 开新标签页——新标签页不经过页面内的 fetch 桩，因此交付物响应
// 由 T07 的临时静态服务（.tmp/chg-007-T07/serve.mjs）在代理前应答，带
// `Content-Disposition: attachment` 与固定长度，由 CDP 下载落盘后比字节。

import fs from 'node:fs';
import path from 'node:path';
import {
  runUiAc, openSessionPage, waitFor, sleep, clickSel,
} from './lib/task-ui-helpers.mjs';
import { ROOT } from '../lib/ac-cdp.mjs';
import { conversationStub, DELIVERABLE_FILE_SIZE } from './lib/conversation-fixture.mjs';

const VIEWPORTS = [1280, 768, 375];
const LATENCY_LIMIT_MS = 5000;

function countFiles(dir) {
  try { return fs.readdirSync(dir).filter((name) => !name.endsWith('.crdownload')); } catch { return []; }
}

runUiAc('AC-CHG-CONV-007-01', async (ctx) => {
  const client = ctx.client;
  const viewportResults = [];
  const latencies = [];

  for (const width of VIEWPORTS) {
    await client.send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
    await openSessionPage(ctx, { stub: conversationStub() });
    await waitFor(client, `document.querySelector('.msg-task-summary') !== null`, { timeout: 10000, label: `${width} 汇总卡` });
    const latency = await client.evaluate(`Math.round(performance.now())`);
    latencies.push({ width, latencyMs: latency });
    const overflow = await client.evaluate(`(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
      bodyScrollWidth: document.body.scrollWidth,
    }))()`);
    viewportResults.push({ width, ...overflow });
    ctx.check(overflow.scrollWidth <= overflow.innerWidth, `${width} 档 scrollWidth 不大于视口`, `<= ${overflow.innerWidth}`, overflow.scrollWidth);
    ctx.check(overflow.bodyScrollWidth <= overflow.innerWidth, `${width} 档 body 不横向溢出`, `<= ${overflow.innerWidth}`, overflow.bodyScrollWidth);

    if (width === 1280) {
      // 5 秒上限（只读夹具口径：导航开始到汇总卡可见）。
      ctx.check(latency <= LATENCY_LIMIT_MS, '汇总卡在 5 秒内可见', `<= ${LATENCY_LIMIT_MS}ms`, `${latency}ms`);

      // 厚卡与详情：右栏任务标签 → t1 厚卡 → 详情层。
      await clickSel(client, 'nav.insp-rail button[data-tab="tasks"]');
      await waitFor(client, `document.querySelector('.task-card[data-task-id="t1"]') !== null`, { timeout: 8000, label: 't1 厚卡' });
      const cardClick = await clickSel(client, '.task-card[data-task-id="t1"]');
      ctx.check(cardClick, '点 t1 厚卡', '点击成功', cardClick ? '成功' : '元素不存在');
      await waitFor(client, `document.querySelector('section.task-detail') !== null`, { timeout: 8000, label: '任务详情' });
      await sleep(350);
      const detail = await client.evaluate(`(() => {
        const el = document.querySelector('section.task-detail');
        const r = el?.getBoundingClientRect();
        return {
          exists: !!el,
          width: Math.round(r?.width ?? 0),
          height: Math.round(r?.height ?? 0),
          title: el?.querySelector('.task-detail-title')?.textContent?.trim() ?? null,
          steps: el ? el.querySelectorAll('.task-step').length : 0,
          deliverables: el ? el.querySelectorAll('.task-file').length : 0,
          downloadHref: el?.querySelector('.task-file .deliverable-name')?.getAttribute('title') ?? null,
        };
      })()`);
      ctx.evidence.detail = detail;
      ctx.check(detail.exists && detail.width > 0 && detail.height > 0, '详情可打开且有尺寸', '宽高 > 0', detail.exists ? `${detail.width}×${detail.height}` : '未出现');
      ctx.check(detail.steps >= 8, '详情展示 8 步计划', '>= 8', detail.steps);
      ctx.check(detail.deliverables >= 1, '详情列出产出文件', '>= 1', detail.deliverables);

      // 交付物下载：右栏「交付物」标签页的下载控件（.deliverable-open，aria-label「下载 …」），
      // 落盘字节数应等于该文件 size 字段（DELIVERABLE_FILE_SIZE）。
      const stamp = Date.now();
      const downloadDir = path.join(ROOT, '.tmp', 'chg-007-T07', 'downloads', String(stamp));
      fs.mkdirSync(downloadDir, { recursive: true });
      await client.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDir, eventsEnabled: true });
      await clickSel(client, 'nav.insp-rail button[data-tab="deliverables"]');
      await waitFor(client, `document.querySelector('.deliverable-file .deliverable-open') !== null`, { timeout: 8000, label: '交付物下载控件' });
      const target = await client.evaluate(`(() => {
        const btn = document.querySelector('.deliverable-file .deliverable-open');
        const row = btn?.closest('.deliverable-file');
        return { label: btn?.getAttribute('aria-label') ?? null, sizeText: row?.querySelector('.deliverable-meta')?.textContent?.trim() ?? null };
      })()`);
      ctx.evidence.downloadControl = target;
      const before = countFiles(downloadDir);
      const dlClick = await clickSel(client, '.deliverable-file .deliverable-open');
      ctx.check(dlClick, '点交付物下载', '点击成功', dlClick ? '成功' : '元素不存在');
      let files = [];
      for (let i = 0; i < 40; i += 1) {
        await sleep(150);
        files = countFiles(downloadDir).filter((name) => !before.includes(name));
        if (files.length > 0) break;
      }
      const downloaded = files.length > 0 ? files[0] : null;
      const bytes = downloaded ? fs.statSync(path.join(downloadDir, downloaded)).size : -1;
      ctx.evidence.download = { dir: downloadDir, file: downloaded, bytes, expect: DELIVERABLE_FILE_SIZE, label: target.label, sizeText: target.sizeText };
      ctx.check(downloaded !== null, '下载落盘', '有文件', downloaded ?? '未落盘');
      ctx.check(bytes === DELIVERABLE_FILE_SIZE, '下载字节 = 响应 size', String(DELIVERABLE_FILE_SIZE), bytes);
    }
  }

  ctx.evidence.latencyBasis = '只读夹具：导航开始 → 汇总卡可见；未覆盖真实提交链路';
  ctx.evidence.latencies = latencies;
  ctx.evidence.viewports = viewportResults;
});
