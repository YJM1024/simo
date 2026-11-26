// AC-CHG-CONV-007-05 · 三档右栏几何与跳转落点（CT-CONV-543，判据表变更级）
//
// 判据（specs/contract/CONV/contract.md CT-CONV-543、specs/design/P1-CONV/spec.md §17，
// 口径按 DEC-35 与已签收 V-CONV-008-6、§17.10）：
//   - 1280 档：右栏展开 320（面板 280 + 竖条 40），收起 40；详情右缘 960 / 1240，左缘 680 / 960，宽 280；
//   - 768 档：首次加载为 40 图标条（抽屉收起，面板宽 0，中栏白卡 508）；点竖条标签后展开 280 抽屉浮层
//             （fixed，不占布局，中栏白卡宽差 ≤1px）；详情在抽屉内容区（right 728、left 448、宽 280）；
//             关抽屉后回到 40 竖条，detailRight 为 null；
//   - 375 档：竖条不重叠，scrollWidth 等于视口，任务标签可打开可滚动；
//   - 「还有 9 个」跳转后首行距滚动口顶 0–8px，三档都测；
//   - 三档各测 2 次，误差 ±1px。
//
// 产物：.tmp/chg-007-T07/metrics.json 与 shots/<vw>-<n>-*.png；证据走 runUiAc 落 .tmp/ac/。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runUiAc, buildStub, openSessionPage, waitFor, sleep, clickSel, TASK_BY_ID } from './lib/task-ui-helpers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(ROOT, '.tmp', 'chg-007-T07');
const SHOTS = path.join(OUT, 'shots');
const VIEWPORTS = [
  { width: 375, height: 812, mobile: true },
  { width: 768, height: 900, mobile: false },
  { width: 1280, height: 900, mobile: false },
];
const near = (a, b, tol = 1) => typeof a === 'number' && Math.abs(a - b) <= tol;

// 条件轮询：详情层与任务面板的打开、关闭都以「可见且身份正确」为准，不用固定 sleep 加一次判定。
const POLL = { timeout: 3000, interval: 50 };
const T1_ID = 't1';
const T1_TITLE = TASK_BY_ID[T1_ID].title;
const t1CardState = `(() => {
  const el = document.querySelector('.task-card[data-task-id="${T1_ID}"]');
  if (!el) return 'missing';
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 ? 'ready' : 'hidden';
})()`;
const t1DetailState = `(() => {
  const el = document.querySelector('section.task-detail');
  if (!el) return 'missing';
  if (getComputedStyle(el).display === 'none') return 'display-none';
  if (el.getAttribute('data-task-id') !== ${JSON.stringify(T1_ID)}) return 'other-task';
  const r = el.getBoundingClientRect();
  if (!(r.width > 0 && r.height > 0)) return 'zero-size';
  const title = el.querySelector('.task-detail-title');
  if (!title) return 'no-title';
  return title.textContent.trim() === ${JSON.stringify(T1_TITLE)} ? 'ready' : 'title-mismatch';
})()`;

/** 切到任务标签并等任务面板挂上；首点没生效或列表还在加载就再点一次。 */
async function openTasksTab(client) {
  let last = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await clickSel(client, 'nav.insp-rail button[data-tab="tasks"]');
    try {
      await waitFor(client, `document.querySelector('.task-panel') !== null`, { ...POLL, label: '任务标签面板' });
      return;
    } catch (err) { last = err; }
  }
  throw last;
}

/** 打开 t1 详情：等任务卡可点后点开，再等详情层可见且 data-task-id 与标题都匹配；没等到就重点一次。 */
async function openTaskDetail(client) {
  await waitFor(client, `${t1CardState} === 'ready'`, { ...POLL, label: 't1 任务卡可点' });
  let last = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await clickSel(client, '.task-card[data-task-id="t1"]');
    try {
      await waitFor(client, `${t1DetailState} === 'ready'`, { ...POLL, label: 't1 详情层可见且 data-task-id / 标题匹配' });
      return true;
    } catch (err) { last = err; }
  }
  throw last;
}

/** 关详情：等关闭按钮可点，点它，再等详情层从 DOM 移除或 display:none。 */
async function closeTaskDetail(client) {
  await waitFor(client, `(() => { const b = document.querySelector('button.task-detail-close'); return !!b && b.getBoundingClientRect().width > 0; })()`, { ...POLL, label: '详情关闭按钮可点' });
  await clickSel(client, 'button.task-detail-close');
  await waitFor(client, `(() => { const el = document.querySelector('section.task-detail'); return !el || getComputedStyle(el).display === 'none'; })()`, { ...POLL, label: '详情层已关闭' });
}

async function snapshot(client, file) {
  const shot = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  fs.mkdirSync(SHOTS, { recursive: true });
  fs.writeFileSync(path.join(SHOTS, file), Buffer.from(shot.data, 'base64'));
}

async function measure(client) {
  return client.evaluate(`(() => {
    const q = (s) => document.querySelector(s);
    const w = (s) => { const el = q(s); if (!el) return null; const r = el.getBoundingClientRect(); return Math.round(r.width * 10) / 10; };
    const aside = q('aside.inspector');
    const detail = q('section.task-detail');
    const rail = q('nav.insp-rail');
    const strip = rail ? [...rail.querySelectorAll('button')].map((b) => { const r = b.getBoundingClientRect(); return { tab: b.getAttribute('data-tab'), left: Math.round(r.left), top: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; }) : [];
    return {
      vw: window.innerWidth,
      asideClass: aside ? aside.className : null,
      collapsed: aside?.getAttribute('data-collapsed') ?? null,
      drawerOpen: !!aside && aside.classList.contains('is-drawer-open'),
      rail: w('aside.inspector'), panel: w('.insp-panel'), strip: w('nav.insp-rail'),
      chatCol: w('.chat-col'), chat: w('.chat'),
      asideHidden: !!aside && getComputedStyle(aside).display === 'none',
      docScrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      stripButtons: strip,
      detailRight: detail ? Math.round(detail.getBoundingClientRect().right * 10) / 10 : null,
      detailLeft: detail ? Math.round(detail.getBoundingClientRect().left * 10) / 10 : null,
      detailWidth: detail ? Math.round(detail.getBoundingClientRect().width * 10) / 10 : null,
      detailTop: detail ? Math.round(detail.getBoundingClientRect().top * 10) / 10 : null,
      tasksScroller: (() => { const s = q('.insp-body'); return s ? { scrollHeight: Math.round(s.scrollHeight), clientHeight: Math.round(s.clientHeight), scrollTop: Math.round(s.scrollTop) } : null; })(),
    };
  })()`);
}

async function jumpOffset(client) {
  await clickSel(client, 'nav.insp-rail button[data-tab="overview"]');
  // 概览块随投影数据渲染，入口可能晚于标签点击出现；轮询到入口再点，不用固定 sleep 赌一次。
  const moreSel = '.insp-block[data-block="tasks"] .insp-more';
  const hasMore = await waitFor(client, `(() => { const b = document.querySelector(${JSON.stringify(moreSel)}); if (!b) return false; b.click(); return true; })()`, { ...POLL, label: '「还有 N 个」入口' }).catch(() => false);
  if (!hasMore) return { skipped: '没有「还有 N 个」入口（竖条隐藏或任务不足）' };
  await waitFor(client, `document.querySelector('.task-card[data-task-id="t3"]') !== null`, { timeout: 8000, label: '跳转目标 t3' });
  const sample = () => client.evaluate(`(() => {
    const t = document.querySelector('.task-card[data-task-id="t3"]');
    const s = document.querySelector('.insp-body');
    if (!t || !s) return null;
    return { offset: Math.round((t.getBoundingClientRect().top - s.getBoundingClientRect().top) * 10) / 10, scrollerTopFromViewport: Math.round(s.getBoundingClientRect().top * 10) / 10 };
  })()`);
  const first = await sample();
  await sleep(520);
  const retest = await sample();
  return { first, retest };
}

runUiAc('AC-CHG-CONV-007-05', async (ctx) => {
  const client = ctx.client;
  const metrics = { ac: 'AC-CHG-CONV-007-05', baseUrl: ctx.baseUrl, tolerancePx: 1, samplesPerViewport: 2, rule: 'DEC-35 / V-CONV-008-6 / design spec §17.10', viewports: [] };

  for (const vp of VIEWPORTS) {
    await client.send('Emulation.setDeviceMetricsOverride', { width: vp.width, height: vp.height, deviceScaleFactor: 1, mobile: vp.mobile });
    const samples = [];
    for (let n = 1; n <= 2; n += 1) {
      const clientPage = await openSessionPage(ctx, { stub: buildStub() });
      await sleep(350);
      // 1) 首屏态：768 档为 40 竖条（抽屉收起），宽档为展开 320，375 档右栏隐藏。
      const initial = await measure(clientPage);
      let expanded = initial;
      let drawerOpenError = null;
      if (vp.width === 768) {
        // 768 档按「首次加载收起、点竖条展开」：点概览标签把抽屉打开后再测展开态。
        try {
          await clickSel(clientPage, 'nav.insp-rail button[data-tab="overview"]');
          await waitFor(clientPage, `document.querySelector('aside.inspector')?.classList.contains('is-drawer-open') === true`, { timeout: 5000, label: '768 抽屉展开' });
          await sleep(300);
          expanded = await measure(clientPage);
        } catch (err) {
          drawerOpenError = String(err?.message ?? err).split('\n')[0];
        }
      }
      // 2) 跳转落点：概览可见时先测，避免收起后入口消失。
      let jump = { skipped: '未测' };
      try { jump = await jumpOffset(clientPage); } catch (err) { jump = { skipped: String(err?.message ?? err).split('\n')[0] }; }
      await snapshot(clientPage, `${vp.width}-${n}-expanded.png`);
      // 3) 任务标签 → t1 厚卡 → 详情。
      let cardClicked = false;
      let detailExpanded = null;
      let detailError = null;
      try {
        await openTasksTab(clientPage);
        if (vp.width === 768) {
          // 768 档点任务标签同样会打开抽屉；抽屉已开时此点击只切标签。
          await waitFor(clientPage, `document.querySelector('aside.inspector')?.classList.contains('is-drawer-open') === true`, { timeout: 5000, label: '768 抽屉保持打开' });
        }
        cardClicked = await openTaskDetail(clientPage);
        detailExpanded = await measure(clientPage);
        await snapshot(clientPage, `${vp.width}-${n}-detail-expanded.png`);
      } catch (err) {
        detailError = String(err?.message ?? err).split('\n')[0];
      }
      // 4) 收起：768 档关抽屉（先关详情再关抽屉），宽档点收起。
      let collapsed = null;
      let detailCollapsed = null;
      let collapseError = null;
      try {
        if (vp.width === 768) {
          if (detailExpanded) await closeTaskDetail(clientPage);
          await waitFor(clientPage, `(() => { const b = document.querySelector('.insp-drawer-close'); return !!b && b.getBoundingClientRect().width > 0; })()`, { ...POLL, label: '抽屉关闭按钮可点' });
          await clickSel(clientPage, '.insp-drawer-close');
          await waitFor(clientPage, `document.querySelector('aside.inspector')?.classList.contains('is-drawer-open') !== true`, { ...POLL, label: '关抽屉' });
        } else {
          const collReady = await waitFor(clientPage, `(() => { const b = document.querySelector('button.insp-collapse'); return !!b && b.getBoundingClientRect().width > 0; })()`, { ...POLL, label: '收起按钮可点' }).catch(() => false);
          if (!collReady) throw new Error('收起按钮不存在或不可点');
          const coll = await clickSel(clientPage, 'button.insp-collapse');
          if (!coll) throw new Error('收起按钮不存在或不可点');
          await waitFor(clientPage, `document.querySelector('aside.inspector')?.getAttribute('data-collapsed') === 'true'`, { ...POLL, label: '收起' });
        }
        collapsed = await measure(clientPage);
        detailCollapsed = await measure(clientPage);
        await snapshot(clientPage, `${vp.width}-${n}-collapsed.png`);
      } catch (err) {
        collapseError = String(err?.message ?? err).split('\n')[0];
      }
      samples.push({ n, initial, expanded, drawerOpenError, cardClicked, detailExpanded, detailError, collapsed, detailCollapsed, collapseError, jump });
    }
    metrics.viewports.push({ ...vp, samples });
    ctx.evidence[`vw${vp.width}`] = samples;
  }

  const find = (vw, pick) => metrics.viewports.find((v) => v.width === vw).samples.map(pick);
  const flat = (vw, pick) => find(vw, pick).filter(Boolean);

  // 1280 档：展开 320 / 收起 40，详情右缘 vw−320 与 vw−40。
  {
    const vw = 1280;
    const exp = flat(vw, (s) => s.expanded);
    const col = flat(vw, (s) => s.collapsed);
    ctx.check(exp.length === 2 && exp.every((m) => near(m.rail, 320)), '1280 档展开右栏 320±1', '320±1（2 次）', exp.map((m) => m.rail));
    ctx.check(exp.every((m) => near(m.panel, 280)), '1280 档面板 280±1', '280±1（2 次）', exp.map((m) => m.panel));
    ctx.check(exp.every((m) => near(m.strip, 40)), '1280 档竖条 40±1', '40±1（2 次）', exp.map((m) => m.strip));
    ctx.check(col.length === 2 && col.every((m) => near(m.rail, 40)), '1280 档收起右栏 40±1', '40±1（2 次）', col.map((m) => m.rail));
    const de = flat(vw, (s) => s.detailExpanded);
    const dc = flat(vw, (s) => s.detailCollapsed);
    // 宽档只判右缘（左缘与宽随中栏自适应，§17.5.1），实测值仍写进 metrics。
    ctx.check(de.length === 2 && de.every((m) => near(m.detailRight, vw - 320)),
      '1280 档详情展开右缘 vw−320±1', '960±1（2 次）',
      de.map((m) => `r${m.detailRight},l${m.detailLeft},w${m.detailWidth}`));
    ctx.check(dc.length === 2 && dc.every((m) => near(m.detailRight, vw - 40)),
      '1280 档收起后详情右缘 vw−40±1', '1240±1（2 次）',
      dc.map((m) => `r${m.detailRight},l${m.detailLeft},w${m.detailWidth}`));
  }

  // 768 档（DEC-35，2026-11-25 口径定稿）：首屏 40 竖条（抽屉收起），点竖条展开 280 抽屉浮层，
  // 不占布局；详情在抽屉内容区。
  {
    const vw = 768;
    const ini = flat(vw, (s) => s.initial);
    const exp = flat(vw, (s) => s.expanded);
    const col = flat(vw, (s) => s.collapsed);
    ctx.check(ini.length === 2 && ini.every((m) => near(m.rail, 40) && m.drawerOpen === false),
      '768 档首屏为 40 竖条（抽屉收起）', 'rail 40±1 且 drawerOpen=false（2 次）', ini.map((m) => `rail${m.rail}/open${m.drawerOpen}`));
    ctx.check(ini.every((m) => !m.panel || m.panel === 0), '768 档首屏抽屉面板宽 0', '0（2 次）', ini.map((m) => m.panel));
    ctx.check(ini.every((m) => near(m.chatCol, 508)), '768 档首屏中栏白卡 508±1', '508±1（2 次）', ini.map((m) => m.chatCol));
    ctx.check(exp.length === 2 && exp.every((m) => near(m.rail, 40) && m.drawerOpen === true),
      '768 档点竖条后为 40 竖条 + 抽屉打开', 'rail 40±1 且 drawerOpen=true（2 次）', exp.map((m) => `rail${m.rail}/open${m.drawerOpen}`));
    ctx.check(exp.every((m) => near(m.panel, 280)), '768 档抽屉面板 280±1', '280±1（2 次）', exp.map((m) => m.panel));
    ctx.check(exp.every((m) => near(m.strip, 40)), '768 档竖条 40±1', '40±1（2 次）', exp.map((m) => m.strip));
    const diff = exp.map((m, i) => {
      const c = ini[i];
      return typeof m.chatCol === 'number' && typeof c?.chatCol === 'number' ? Math.round(Math.abs(m.chatCol - c.chatCol) * 10) / 10 : null;
    });
    ctx.check(exp.length === 2 && ini.length === 2 && diff.every((d) => typeof d === 'number' && d <= 1),
      '768 档抽屉不挤压中栏白卡（宽差 ≤1px）', '|Δ|≤1（展开 vs 首屏）',
      diff.map((d, i) => `Δ${d}（${exp[i]?.chatCol} vs ${ini[i]?.chatCol}）`));
    ctx.check(col.length === 2 && col.every((m) => near(m.rail, 40) && m.drawerOpen === false), '768 档收起为 40 竖条（抽屉关闭）', 'rail 40±1 且 drawerOpen=false（2 次）', col.map((m) => `rail${m.rail}/${m.drawerOpen}`));
    ctx.check(col.every((m) => !m.panel || m.panel === 0), '768 档收起后抽屉不遮挡（面板宽 0）', '面板宽 0', col.map((m) => m.panel));
    const de = flat(vw, (s) => s.detailExpanded);
    ctx.check(de.length === 2 && de.every((m) => near(m.detailRight, vw - 40) && near(m.detailLeft, vw - 40 - 280) && near(m.detailWidth, 280)),
      '768 档详情在抽屉内容区 right 728 / left 448 / width 280±1', 'right 728, left 448, width 280（2 次）',
      de.map((m) => `r${m.detailRight},l${m.detailLeft},w${m.detailWidth}`));
    const dc = flat(vw, (s) => s.detailCollapsed);
    ctx.check(dc.length === 2 && dc.every((m) => m.detailRight === null), '768 档收起后详情不渲染（detailRight 为 null）', 'null（2 次）', dc.map((m) => m.detailRight));
  }

  // 三档都不横向溢出。
  for (const vw of [1280, 768, 375]) {
    const all = flat(vw, (s) => s.detailExpanded ?? s.expanded);
    ctx.check(all.every((m) => m.docScrollWidth <= m.vw && m.bodyScrollWidth <= m.vw), `${vw} 档横向不溢出`, `scrollWidth≤${vw}`, all.map((m) => `${m.docScrollWidth}/${m.bodyScrollWidth}`));
  }

  // 375：竖条不重叠、任务标签可打开可滚动。
  const narrow = flat(375, (s) => s.expanded);
  const overlap = narrow.map((m) => {
    const rows = m.stripButtons;
    for (let i = 0; i < rows.length; i += 1) for (let j = i + 1; j < rows.length; j += 1) {
      const a = rows[i]; const b = rows[j];
      if (!a || !b) continue;
      if (a.left < b.left + b.w && b.left < a.left + a.w && a.top < b.top + b.h && b.top < a.top + a.h) return `${a.tab}/${b.tab}`;
    }
    return null;
  }).filter(Boolean);
  ctx.check(overlap.length === 0, '375 档竖条按钮互不重叠', '0 处重叠', overlap.length ? overlap : 0);
  ctx.check(narrow.every((m) => m.tasksScroller && m.tasksScroller.scrollHeight >= m.tasksScroller.clientHeight), '375 档任务列表可滚动', 'scrollHeight≥clientHeight', narrow.map((m) => m.tasksScroller && `${m.tasksScroller.scrollHeight}/${m.tasksScroller.clientHeight}`));

  // 跳转落点 0–8px，三档都测。
  for (const vw of [1280, 768, 375]) {
    const jumps = flat(vw, (s) => s.jump).filter((j) => j.first);
    if (!jumps.length) { ctx.check(false, `${vw} 档跳转落点可测`, '「还有 9 个」→首行', '入口不可用'); continue; }
    ctx.check(jumps.every((j) => j.first.offset >= 0 && j.first.offset <= 8), `${vw} 档跳转首行距滚动口顶 0–8px`, '0–8', jumps.map((j) => j.first.offset));
    ctx.check(jumps.every((j) => Math.abs(j.retest.offset - j.first.offset) <= 1), `${vw} 档 500ms 后落点复测 ±1px`, '±1', jumps.map((j) => `${j.first.offset}→${j.retest.offset}`));
  }

  // 两次采样之间的重复性 ±1。
  const repeatKeys = ['rail', 'panel', 'strip', 'chatCol', 'detailRight', 'detailWidth'];
  for (const vw of [1280, 768, 375]) {
    const exp = flat(vw, (s) => s.expanded);
    if (exp.length < 2) { ctx.check(false, `${vw} 档采样 2 次`, '2', exp.length); continue; }
    const drift = repeatKeys.map((k) => (typeof exp[0][k] === 'number' && typeof exp[1][k] === 'number' ? `${k}:${Math.abs(exp[0][k] - exp[1][k])}` : `${k}:n/a`));
    ctx.check(drift.every((d) => d.endsWith(':n/a') || Number(d.split(':')[1]) <= 1), `${vw} 档两次采样误差 ±1px`, '≤1', drift);
  }

  // 六项几何汇总进 metrics.json，供 evidence.md 直接引用。
  metrics.summary = [1280, 768, 375].map((vw) => {
    const ini = flat(vw, (s) => s.initial);
    const exp = flat(vw, (s) => s.expanded);
    const de = flat(vw, (s) => s.detailExpanded);
    const dc = flat(vw, (s) => s.detailCollapsed);
    const jumps = flat(vw, (s) => s.jump).filter((j) => j.first);
    return {
      viewport: vw,
      initialRail: ini.map((m) => m.rail), initialPanel: ini.map((m) => m.panel), initialChatCol: ini.map((m) => m.chatCol),
      initialDrawerOpen: ini.map((m) => m.drawerOpen),
      rail: exp.map((m) => m.rail), panel: exp.map((m) => m.panel), strip: exp.map((m) => m.strip),
      drawerOpen: exp.map((m) => m.drawerOpen),
      detailRight: de.map((m) => m.detailRight), detailLeft: de.map((m) => m.detailLeft), detailWidth: de.map((m) => m.detailWidth),
      jumpOffset: jumps.map((j) => j.first.offset), jumpScrollerTop: jumps.map((j) => j.first.scrollerTopFromViewport),
      collapsedRail: dc.map((m) => m.rail), collapsedPanel: dc.map((m) => m.panel), collapsedDetailRight: dc.map((m) => m.detailRight),
      chatCol: exp.map((m) => m.chatCol), collapsedChatCol: dc.map((m) => m.chatCol),
    };
  });

  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'metrics.json'), JSON.stringify(metrics, null, 2));
  ctx.evidence.metricsFile = path.join(OUT, 'metrics.json');
});
