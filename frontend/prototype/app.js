/* Simo prototype interactions + state rendering */
(() => {
  const params = new URLSearchParams(location.search);
  const state = params.get('state') || 'normal';
  document.body.dataset.state = state;

  const messagesEl = document.getElementById('messages');
  const railEl = document.getElementById('rail');
  const scrollEl = document.getElementById('scroll');
  const input = document.getElementById('input');

  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const md = (text) => {
    let t = esc(text);
    t = t.replace(/```([\s\S]*?)```/g, (_, code) => `<pre><code>${code.trim()}</code></pre>`);
    t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
    t = t.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
    t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
    const lines = t.split('\n');
    let out = '', list = false, table = false;
    const flush = () => {
      if (list) { out += '</ul>'; list = false; }
      if (table) { out += '</table>'; table = false; }
    };
    for (const raw of lines) {
      const line = raw.trimEnd();
      if (/^\s*[-*]\s+/.test(line)) {
        if (!list) { flush(); out += '<ul>'; list = true; }
        out += `<li>${line.replace(/^\s*[-*]\s+/, '')}</li>`;
        continue;
      }
      if (line.startsWith('|') && line.endsWith('|')) {
        const cells = line.slice(1, -1).split('|').map(c => c.trim());
        if (cells.every(c => /^:?-{2,}:?$/.test(c))) continue;
        if (!table) { flush(); out += '<table>'; table = true; }
        out += '<tr>' + cells.map(c => `<td>${c}</td>`).join('') + '</tr>';
        continue;
      }
      flush();
      if (line === '') { out += ''; continue; }
      if (/^#{1,3}\s+/.test(line)) { out += `<p><b>${line.replace(/^#{1,3}\s+/, '')}</b></p>`; continue; }
      out += `<p>${line}</p>`;
    }
    flush();
    return out;
  };

  const msg = (role, name, body, opts = {}) => {
    const parts = [
      `<span class="msg__name">${esc(name)}</span>`,
      opts.category ? `<span class="msg__dot"></span><span>${esc(opts.category)}</span>` : '',
      `<span class="msg__dot"></span><span>主会话</span>`,
      `<span class="msg__dot"></span><span>${opts.time || '10:24'}</span>`
    ].filter(Boolean).join('');
    return `
    <div class="msg msg--${role}">
      <span class="msg__avatar">${role === 'agent' ? '墨' : '你'}</span>
      <div class="msg__body">
        <div class="msg__meta">${parts}</div>
        <div class="msg__text">${body}${opts.caret ? '<span class="caret"></span>' : ''}</div>
        ${opts.error ? `<div class="err">${esc(opts.error)}</div>` : ''}
      </div>
    </div>`;
  };

  const longAgent = [
    '## 数据分析规则草案',
    '',
    '先列一版，你增删改后我再定稿。',
    '',
    '### 1. 数据来源与边界',
    '- 只读 `workspace` 内的文件；外部数据需你明确提供路径或粘贴内容',
    '- 原始数据**只读不覆盖**：所有输出另存新文件',
    '- 不删除任何源文件，不做批量改名',
    '',
    '### 2. 口径先对齐，再算数',
    '| 项目 | 需明确内容 |',
    '| --- | --- |',
    '| 范围 | 时间区间、包含/排除的维度 |',
    '| 指标定义 | 例如"活跃用户"= 登录过 还是 有行为 |',
    '| 算法口径 | 去重方式、分母、同比/环比基准 |',
    '',
    '### 3. 输出规范',
    '- 结论先行：结论 → 支撑数据 → 明细',
    '- 每个数字注明来源文件与筛选条件，保证可复现',
    '',
    '```js',
    'const rows = await load("sales.csv");',
    'const total = rows.reduce((a, r) => a + r.amount, 0);',
    '```',
    '',
    '### 4. 审批点（我会先问再做）',
    '- 写入/覆盖文件',
    '- 生成 PDF/DOCX/XLSX 成品',
    '- 对外发送任何结果'
  ].join('\n');

  let renderCount = 0;
  const renderMessages = () => {
    if (state === 'empty') {
      messagesEl.innerHTML = `
        <div class="empty">
          <div class="empty__avatar">墨</div>
          <h2>开始和司墨对话</h2>
          <p>说需求、记信息、派任务；结果都会回到这里。</p>
          <div class="suggest">
            <button type="button"><span>01</span>帮我整理一份本周待办</button>
            <button type="button"><span>02</span>记住：我的项目叫「司墨」</button>
            <button type="button"><span>03</span>解释一下当前工作区</button>
          </div>
        </div>`;
      railEl.innerHTML = '';
      return;
    }
    if (state === 'loading') {
      messagesEl.innerHTML = `
        <div class="msg msg--agent"><span class="msg__avatar">墨</span><div class="msg__body">
          <div class="msg__meta"><span class="msg__name">司墨</span></div>
          <div class="skeleton" style="width:62%"></div><div class="skeleton" style="width:92%"></div><div class="skeleton" style="width:78%"></div>
        </div></div>`;
      railEl.innerHTML = '<span class="tick tick--user"></span>';
      return;
    }

    const rows = [];
    rows.push(msg('user', '你', '<p>帮我整理一下本周的工作重点，按优先级排。</p>', { time: '10:21' }));
    rows.push(msg('agent', '司墨', `<p>我先确认三件事，避免排序偏：</p><ul><li><b>目标</b>：本周交付 / 对外沟通 / 内部建设，哪类优先？</li><li><b>约束</b>：是否有硬截止事项？</li><li><b>产出</b>：一句话清单，还是带说明的表格？</li></ul>`, { category: '需求澄清', time: '10:22' }));
    rows.push(msg('user', '你', '<p>优先交付；周五有一个必须上线的东西；给我表格。</p>', { time: '10:23' }));
    rows.push(msg('agent', '司墨', md(longAgent), { category: '进度汇报', time: '10:24' }));
    rows.push(msg('user', '你', '<p>规则可以，先把「本周重点」表列出来。</p>', { time: '10:26' }));

    if (state === 'error') {
      rows.push(msg('agent', '司墨', '<p>（正在生成…）</p>', { category: '进度汇报', time: '10:27', caret: true, error: '回复中断：模型响应超时，消息已标记为失败。' }));
    } else if (state === 'streaming') {
      rows.push(msg('agent', '司墨', '<p>正在整理本周重点，我先按「交付 / 沟通 / 建设」分组…</p>', { category: '进度汇报', time: '10:27', caret: true }));
    } else {
      rows.push(msg('agent', '司墨', md('| 优先级 | 事项 | 截止 |\n| --- | --- | --- |\n| P0 | 周五上线（发布窗口 18:00） | 周五 |\n| P1 | 回归测试与回滚预案 | 周四 |\n| P2 | 周报与下周计划 | 周五 |'), { category: '进度汇报', time: '10:27' }));
    }
    if (state === 'long') {
      for (let i = 0; i < 14; i++) {
        rows.push(msg(i % 2 ? 'agent' : 'user', i % 2 ? '司墨' : '你', `<p>第 ${i + 1} 轮：同步一下当前进展与下一步。</p>`, { time: `11:${String(i).padStart(2, '0')}` }));
      }
    }
    messagesEl.innerHTML = rows.join('');

    // timeline: one tick per message, colored by role
    const msgNodes = [...messagesEl.querySelectorAll('.msg')];
    railEl.innerHTML = msgNodes.map((n, i) => {
      const role = n.classList.contains('msg--user') ? 'user' : 'agent';
      return `<span class="tick tick--${role}${i === msgNodes.length - 1 ? ' is-cur' : ''}" title="第 ${i + 1} 条"></span>`;
    }).join('');
  };

  renderMessages();

  // instant jump to bottom
  const jumpBottom = () => { scrollEl.scrollTop = scrollEl.scrollHeight; };
  jumpBottom();
  requestAnimationFrame(jumpBottom);

  // composer auto-grow
  const grow = () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 196) + 'px';
  };
  input.addEventListener('input', grow);
  grow();

  const send = () => {
    const text = input.value.trim();
    if (!text) return;
    const div = document.createElement('div');
    div.className = 'msg msg--user';
    div.innerHTML = `<span class="msg__avatar">你</span><div class="msg__body"><div class="msg__meta"><span class="msg__name">你</span><span class="msg__dot"></span><span>主会话</span><span class="msg__dot"></span><span>刚刚</span></div><div class="msg__text"><p>${esc(text)}</p></div></div>`;
    messagesEl.appendChild(div);
    railEl.insertAdjacentHTML('beforeend', '<span class="tick tick--user is-cur"></span>');
    input.value = '';
    grow();
    jumpBottom();
  };
  document.getElementById('send').addEventListener('click', send);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });

  // popover
  const pop = document.getElementById('popover-permission');
  document.querySelectorAll('[data-popover]').forEach(btn => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); pop.hidden = !pop.hidden; });
  });
  document.addEventListener('click', (e) => { if (!pop.hidden && !pop.contains(e.target)) pop.hidden = true; });

  // modal
  const overlay = document.getElementById('overlay');
  document.querySelectorAll('[data-modal]').forEach(btn => btn.addEventListener('click', () => { overlay.hidden = false; }));
  document.querySelectorAll('[data-close]').forEach(btn => btn.addEventListener('click', () => { overlay.hidden = true; }));
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.hidden = true; });
  if (state === 'settings') overlay.hidden = false;
  if (state === 'permission') pop.hidden = false;

  // right panel
  const panel = document.getElementById('panel');
  document.querySelectorAll('[data-rail]').forEach(btn => {
    btn.addEventListener('click', () => {
      panel.hidden = !panel.hidden;
      document.querySelectorAll('[data-rail]').forEach(b => b.classList.toggle('is-active', !panel.hidden && b === btn));
    });
  });
  panel.querySelector('.icon-btn').addEventListener('click', () => { panel.hidden = true; });

  // segmented control
  document.querySelectorAll('.segmented button').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('.segmented button').forEach(x => x.classList.remove('is-active'));
    b.classList.add('is-active');
  }));

  // tabs
  document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', (e) => e.preventDefault()));
})();
