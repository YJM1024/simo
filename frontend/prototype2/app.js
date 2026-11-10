(() => {
  const q = new URLSearchParams(location.search);
  const state = q.get('state') || 'normal';
  document.body.dataset.state = state;

  const $ = (s, r = document) => r.querySelector(s);
  const msgs = $('#messages');
  const rail = $('#rail');
  const scroll = $('#scroll');
  const input = $('#input');
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  function md(text) {
    let t = esc(text);
    const codes = [];
    t = t.replace(/```[a-zA-Z]*\n?([\s\S]*?)```/g, (_, c) => { codes.push(c.trim()); return `\n@@CODE${codes.length - 1}@@\n`; });
    t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
    const out = [];
    let list = false, table = false;
    const close = () => { if (list) { out.push('</ul>'); list = false; } if (table) { out.push('</table>'); table = false; } };
    for (const raw of t.split('\n')) {
      const line = raw.trimEnd();
      if (/^\s*[-*]\s+/.test(line)) { if (!list) { close(); out.push('<ul>'); list = true; } out.push(`<li>${line.replace(/^\s*[-*]\s+/, '')}</li>`); continue; }
      if (line.startsWith('|') && line.endsWith('|')) {
        const cells = line.slice(1, -1).split('|').map(c => c.trim());
        if (cells.every(c => /^:?-{2,}:?$/.test(c))) continue;
        if (!table) { close(); out.push('<table>'); table = true; }
        out.push('<tr>' + cells.map(c => `<td>${c}</td>`).join('') + '</tr>');
        continue;
      }
      close();
      if (!line) continue;
      const codeMatch = line.match(/^@@CODE(\d+)@@$/);
      if (codeMatch) { out.push(`<pre><code>${codes[Number(codeMatch[1])]}</code></pre>`); continue; }
      const h = line.match(/^#{1,4}\s+(.*)$/);
      out.push(h ? `<p><b>${h[1]}</b></p>` : `<p>${line}</p>`);
    }
    close();
    return out.join('');
  }

  const message = (role, name, body, o = {}) => {
    const meta = [
      `<span class="msg__name">${esc(name)}</span>`,
      o.category ? `<span class="msg__dot"></span><span>${esc(o.category)}</span>` : '',
      '<span class="msg__dot"></span><span>主会话</span>',
      `<span class="msg__dot"></span><span>${o.time || '10:24'}</span>`
    ].filter(Boolean).join('');
    return `<div class="msg msg--${role}"><span class="msg__avatar">${role === 'agent' ? '墨' : '你'}</span><div class="msg__body"><div class="msg__meta">${meta}</div><div class="msg__text">${body}${o.caret ? '<span class="caret"></span>' : ''}</div>${o.error ? `<div class="err">${esc(o.error)}</div>` : ''}</div></div>`;
  };

  const longAgent = `## 数据分析规则草案

先列一版，你增删改后我再定稿。

### 1. 数据来源与边界
- 只读 \`workspace\` 内的文件；外部数据需你提供路径或粘贴内容
- 原始数据只读不覆盖：所有输出另存新文件
- 不删除任何源文件，不做批量改名

### 2. 口径先对齐，再算数
| 项目 | 需明确内容 |
| --- | --- |
| 范围 | 时间区间、包含/排除的维度 |
| 指标定义 | 例如"活跃用户"= 登录过 还是 有行为 |
| 算法口径 | 去重方式、分母、同比/环比基准 |

### 3. 输出规范
- 结论先行：结论 → 支撑数据 → 明细
- 每个数字注明来源文件与筛选条件，保证可复现

\`\`\`js
const rows = await load("sales.csv");
const total = rows.reduce((a, r) => a + r.amount, 0);
\`\`\`

### 4. 审批点（我会先问再做）
- 写入/覆盖文件
- 生成 PDF/DOCX/XLSX 成品
- 对外发送任何结果`;

  function render() {
    if (state === 'empty') {
      msgs.innerHTML = `<div class="empty-wrap"><div class="empty__mark">墨</div><h2>开始和司墨对话</h2><p>说需求、记信息、派任务；结果都会回到这里。</p><div class="suggest"><button><b>01</b>帮我整理一份本周待办</button><button><b>02</b>记住：我的项目叫「司墨」</button><button><b>03</b>解释一下当前工作区</button></div></div>`;
      rail.innerHTML = ''; return;
    }
    if (state === 'loading') {
      msgs.innerHTML = `<div class="msg msg--agent"><span class="msg__avatar">墨</span><div class="msg__body"><div class="msg__meta"><span class="msg__name">司墨</span></div><div class="skeleton" style="width:58%"></div><div class="skeleton" style="width:92%"></div><div class="skeleton" style="width:74%"></div></div></div>`;
      rail.innerHTML = '<span class="tick tick--user"></span>'; return;
    }
    const rows = [];
    rows.push(message('user', '你', '<p>帮我整理一下本周的工作重点，按优先级排。</p>', { time: '10:21' }));
    rows.push(message('agent', '司墨', `<p>我先确认三件事，避免排序偏：</p><ul><li><b>目标</b>：本周交付 / 对外沟通 / 内部建设，哪类优先？</li><li><b>约束</b>：是否有硬截止事项？</li><li><b>产出</b>：一句话清单，还是带说明的表格？</li></ul>`, { category: '需求澄清', time: '10:22' }));
    rows.push(message('user', '你', '<p>优先交付；周五有一个必须上线的东西；给我表格。</p>', { time: '10:23' }));
    rows.push(message('agent', '司墨', md(longAgent), { category: '进度汇报', time: '10:24' }));
    rows.push(message('user', '你', '<p>规则可以，先把「本周重点」表列出来。</p>', { time: '10:26' }));
    if (state === 'error') rows.push(message('agent', '司墨', '<p>（正在生成…）</p>', { category: '进度汇报', time: '10:27', caret: true, error: '回复中断：模型响应超时，消息已标记为失败。' }));
    else if (state === 'streaming') rows.push(message('agent', '司墨', '<p>正在整理本周重点，我先按「交付 / 沟通 / 建设」分组…</p>', { category: '进度汇报', time: '10:27', caret: true }));
    else rows.push(message('agent', '司墨', md('| 优先级 | 事项 | 截止 |\n| --- | --- | --- |\n| P0 | 周五上线（发布窗口 18:00） | 周五 |\n| P1 | 回归测试与回滚预案 | 周四 |\n| P2 | 周报与下周计划 | 周五 |'), { category: '进度汇报', time: '10:27' }));
    if (state === 'long') {
      for (let i = 0; i < 14; i++) rows.push(message(i % 2 ? 'agent' : 'user', i % 2 ? '司墨' : '你', `<p>第 ${i + 1} 轮：同步一下当前进展与下一步。</p>`, { time: `11:${String(i).padStart(2, '0')}` }));
    }
    msgs.innerHTML = rows.join('');
    const nodes = [...msgs.querySelectorAll('.msg')];
    rail.innerHTML = nodes.map((n, i) => `<span class="tick tick--${n.classList.contains('msg--user') ? 'user' : 'agent'}${i === nodes.length - 1 ? ' is-cur' : ''}" title="第 ${i + 1} 条"></span>`).join('');
  }
  render();

  const jump = () => { scroll.scrollTop = scroll.scrollHeight; };
  jump(); requestAnimationFrame(jump);
  setTimeout(jump, 60);

  const grow = () => { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 188) + 'px'; };
  input.addEventListener('input', grow); grow();

  const send = () => {
    const t = input.value.trim(); if (!t) return;
    const el = document.createElement('div');
    el.className = 'msg msg--user';
    el.innerHTML = `<span class="msg__avatar">你</span><div class="msg__body"><div class="msg__meta"><span class="msg__name">你</span><span class="msg__dot"></span><span>主会话</span><span class="msg__dot"></span><span>刚刚</span></div><div class="msg__text"><p>${esc(t)}</p></div></div>`;
    msgs.appendChild(el);
    rail.insertAdjacentHTML('beforeend', '<span class="tick tick--user is-cur"></span>');
    input.value = ''; grow(); jump();
  };
  $('#send').addEventListener('click', send);
  input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });

  // permission popover
  const pop = $('#popover-permission');
  document.querySelectorAll('[data-popover]').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); pop.hidden = !pop.hidden; }));
  document.addEventListener('click', e => { if (!pop.hidden && !pop.contains(e.target)) pop.hidden = true; });

  // settings dialog
  const overlay = $('#overlay');
  document.querySelectorAll('[data-modal]').forEach(b => b.addEventListener('click', () => { overlay.hidden = false; }));
  document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => { overlay.hidden = true; }));
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.hidden = true; });

  // inspector: two panes
  const inspector = $('#inspector');
  const panel = inspector.querySelector('.inspector__panel');
  const railBtns = [...inspector.querySelectorAll('.inspector__btn[data-insp]')];
  const paneBtns = [...inspector.querySelectorAll('[data-pane]')];
  const bodies = [...inspector.querySelectorAll('[data-body]')];
  const openInspector = (which) => {
    panel.hidden = false;
    inspector.dataset.open = 'true';
    railBtns.forEach(b => b.classList.toggle('is-active', b.dataset.insp === which));
    paneBtns.forEach(b => b.classList.toggle('is-active', b.dataset.pane === which));
    bodies.forEach(b => { b.hidden = b.dataset.body !== which; });
  };
  railBtns.forEach(btn => btn.addEventListener('click', () => {
    const which = btn.dataset.insp;
    if (!panel.hidden && btn.classList.contains('is-active')) { panel.hidden = true; inspector.dataset.open = 'false'; return; }
    openInspector(which);
  }));
  paneBtns.forEach(btn => btn.addEventListener('click', () => openInspector(btn.dataset.pane)));
  inspector.querySelector('[data-insp-close]').addEventListener('click', () => { panel.hidden = true; inspector.dataset.open = 'false'; });

  if (state === 'settings') overlay.hidden = false;
  if (state === 'permission') pop.hidden = false;
  if (state === 'overview') openInspector('overview');
  else if (state === 'tasks') openInspector('tasks');
  else if (state !== 'empty' && state !== 'loading') openInspector('tasks');
})();
