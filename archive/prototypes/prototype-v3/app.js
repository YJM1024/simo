(function () {
  'use strict';
  var messages = document.getElementById('messages');
  var track = document.getElementById('tlTrack');
  var timeline = document.getElementById('timeline');
  var tip = document.getElementById('tlTip');
  var toast = document.getElementById('toast');
  var groups = [];
  var parentMark = null;
  var content = null;

  function showToast(text) {
    if (!toast) return;
    toast.textContent = text;
    toast.classList.add('is-on');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(function () { toast.classList.remove('is-on'); }, 2200);
  }
  function now() {
    var d = new Date();
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  /* ---------------- timeline ---------------- */
  function collect() {
    groups = [];
    var byTurn = {};
    var order = [];
    messages.querySelectorAll('.msg[data-turn]').forEach(function (el) {
      var key = el.getAttribute('data-turn');
      if (!byTurn[key]) {
        byTurn[key] = { key: key, first: el, roles: {}, count: 0, time: '', text: '', parent: el.getAttribute('data-parent') === '1' };
        order.push(key);
      }
      var g = byTurn[key];
      g.roles[el.getAttribute('data-role')] = true;
      g.count++;
      g.time = g.time || el.getAttribute('data-time') || '';
      g.text = g.text || el.getAttribute('data-text') || '';
    });
    order.forEach(function (k) { groups.push(byTurn[k]); });
  }

  function buildTimeline() {
    if (!track) return;
    collect();
    track.innerHTML = '';
    if (!groups.length) { timeline.style.display = 'none'; return; }
    timeline.style.display = '';

    var date = document.createElement('div');
    date.className = 'tl-date';
    date.textContent = '11/12';

    content = document.createElement('div');
    content.className = 'tl-content';

    parentMark = null;
    groups.forEach(function (g, i) {
      if (g.parent && !parentMark) {
        parentMark = document.createElement('div');
        parentMark.className = 'tl-parent';
        parentMark.title = '此前的消息来自上级会话';
        parentMark.innerHTML = '<span><svg class="icon icon--sm" style="width:10px;height:10px"><use href="#i-arrow-up"/></svg></span>';
        content.appendChild(parentMark);
      }
      var kind = g.roles.user && g.roles.agent ? 'both' : (g.roles.user ? 'user' : 'agent');
      var bar = document.createElement('button');
      bar.type = 'button';
      bar.className = 'tl-bar';
      bar.setAttribute('data-kind', kind);
      bar.setAttribute('data-i', String(i));
      bar.setAttribute('aria-label', (g.parent ? '上级会话，' : '') + (g.time || '') + ' 的消息');
      bar.innerHTML = '<i class="tl-bar__u"></i><i class="tl-bar__a"></i>';
      bar.addEventListener('click', function () { jumpTo(g); });
      bar.addEventListener('mouseenter', function () { showTip(g, bar); });
      bar.addEventListener('mouseleave', function () { tip.hidden = true; });
      bar.addEventListener('focus', function () { showTip(g, bar); });
      bar.addEventListener('blur', function () { tip.hidden = true; });
      g.bar = bar;
      content.appendChild(bar);
    });
    track.appendChild(content);
    track.appendChild(date);
    requestAnimationFrame(layout);
  }

  function yInContent(el) {
    return el.getBoundingClientRect().top - messages.getBoundingClientRect().top + messages.scrollTop;
  }

  function layout() {
    if (!content || !groups.length) return;
    content.style.height = messages.scrollHeight + 'px';
    groups.forEach(function (g) {
      if (g.bar) g.bar.style.top = Math.max(0, yInContent(g.first) + 6) + 'px';
    });
    if (parentMark) {
      var p = groups.find(function (g) { return g.parent; });
      if (p) parentMark.style.top = Math.max(0, yInContent(p.first) - 10) + 'px';
    }
    sync();
  }

  function setCurrent(i) {
    if (!track) return;
    track.querySelectorAll('.tl-bar').forEach(function (b) {
      var on = +b.getAttribute('data-i') === i;
      b.classList.toggle('is-current', on);
      b.setAttribute('aria-current', on ? 'true' : 'false');
    });
  }

  function showTip(g, bar) {
    if (!tip) return;
    var sender = g.roles.user && g.roles.agent ? '你 · 司墨' : (g.roles.user ? '你' : '司墨');
    var meta = [];
    if (g.parent) meta.push('主会话');
    if (g.time) meta.push(g.time);
    meta.push(g.count + ' 条消息');
    tip.innerHTML = '<div class="tl-tip__head"><b>' + sender + '</b><span>·</span><span>' + meta.join(' · ') + '</span></div>' +
      '<div class="tl-tip__text">' + (g.text || '消息') + '</div>' +
      '<div class="tl-tip__meta">点击跳转到这一轮</div>';
    tip.hidden = false;
    var r = bar.getBoundingClientRect();
    var left = r.right + 10;
    if (left + 268 > window.innerWidth - 12) left = r.left - 278;
    var top = Math.min(Math.max(8, r.top - 6), window.innerHeight - 116);
    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
  }

  function jumpTo(g) {
    if (!g || !g.first) return;
    g.first.scrollIntoView({ behavior: 'smooth', block: 'start' });
    g.first.classList.remove('is-flash');
    void g.first.offsetWidth;
    g.first.classList.add('is-flash');
    setTimeout(function () { g.first.classList.remove('is-flash'); }, 1200);
    setCurrent(groups.indexOf(g));
  }

  function sync() {
    if (!content) return;
    content.style.transform = 'translateY(' + (-messages.scrollTop) + 'px)';
    if (!groups.length) return;
    var top = messages.getBoundingClientRect().top;
    var idx = 0;
    groups.forEach(function (g, i) {
      if (g.first.getBoundingClientRect().top - top <= 96) idx = i;
    });
    setCurrent(idx);
  }

  messages.addEventListener('scroll', sync, { passive: true });
  window.addEventListener('resize', function () { layout(); });

  /* ---------------- parent divider ---------------- */
  var backToSelf = document.getElementById('backToSelf');
  if (backToSelf) backToSelf.addEventListener('click', function () {
    var d = document.querySelector('.session-divider');
    if (d) d.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  /* ---------------- interaction card ---------------- */
  var card = document.getElementById('sourceCard');
  var selected = 'A';
  function selectedText() {
    var b = card && card.querySelector('.opt[data-opt="' + selected + '"] .opt__text b');
    return b ? b.textContent : '';
  }
  function appendAgent(text, tag) {
    var row = document.createElement('article');
    row.className = 'msg is-agent';
    row.setAttribute('data-role', 'agent');
    row.innerHTML =
      '<span class="msg__avatar">墨</span>' +
      '<div class="msg__body"><div class="msg__meta"><b>司墨</b><span class="sep">·</span>' +
      (tag ? '<span class="tag">' + tag + '</span><span class="sep">·</span>' : '') +
      '<span>' + now() + '</span></div>' +
      '<div class="msg__text"><p>' + text + '</p></div></div>';
    var streaming = document.getElementById('streamingRow');
    if (streaming) messages.insertBefore(row, streaming);
    else messages.appendChild(row);
    buildTimeline();
    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return row;
  }

  if (card) {
    var confirm = document.getElementById('cardConfirm');
    var cancel = document.getElementById('cardCancel');
    var badge = document.getElementById('cardBadge');
    var state = document.getElementById('cardState');
    var actions = document.getElementById('cardActions');

    card.querySelectorAll('.opt').forEach(function (opt) {
      opt.addEventListener('click', function () {
        if (card.classList.contains('is-done')) return;
        card.querySelectorAll('.opt').forEach(function (o) {
          o.classList.remove('is-on');
          o.setAttribute('aria-checked', 'false');
        });
        opt.classList.add('is-on');
        opt.setAttribute('aria-checked', 'true');
        selected = opt.getAttribute('data-opt');
      });
    });

    if (confirm) confirm.addEventListener('click', function () {
      if (card.classList.contains('is-done')) return;
      card.classList.add('is-done');
      badge.className = 'badge badge--ok';
      badge.textContent = '已确认';
      state.textContent = 'v2 · 已提交';
      card.querySelectorAll('.opt').forEach(function (o) { o.disabled = true; o.style.cursor = 'default'; });
      actions.innerHTML = '<span class="card__done"><svg class="icon icon--sm"><use href="#i-check"/></svg>已确认，开始执行</span>';
      appendAgent('已确认：' + selectedText().replace(/^[A-C]\s·\s/, '') + '。开始执行，预计 2–3 分钟；完成后单独汇报，不打断对话。', '确认');
      showToast('已确认，后台任务已开始');
    });

    if (cancel) cancel.addEventListener('click', function () {
      if (card.classList.contains('is-done')) return;
      card.classList.add('is-done');
      badge.className = 'badge badge--mute';
      badge.textContent = '已取消';
      state.textContent = 'v2 · 已取消';
      card.querySelectorAll('.opt').forEach(function (o) { o.disabled = true; o.style.cursor = 'default'; });
      actions.innerHTML = '<span class="muted" style="font-size:11.5px">未执行</span>';
      appendAgent('已取消这次选择。你可以直接回复想要的方案，或者重新发起确认。', '取消');
      showToast('已取消');
    });
  }

  /* ---------------- task stack ---------------- */
  var stack = document.getElementById('taskstack');
  var stackToggle = document.getElementById('stackToggle');
  function closeStack() {
    if (!stack) return;
    stack.querySelectorAll('.task-card').forEach(function (c) {
      c.classList.remove('is-open');
      var s = c.querySelector('.task-steps'); if (s) s.hidden = true;
      var b = c.querySelector('.task-card__main'); if (b) b.setAttribute('aria-expanded', 'false');
    });
    if (stackToggle) stackToggle.firstChild.nodeValue = '展开步骤 ';
  }
  if (stack) {
    stack.querySelectorAll('.task-card__main').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var cardEl = btn.closest('.task-card');
        var open = cardEl.classList.contains('is-open');
        closeStack();
        if (!open) {
          cardEl.classList.add('is-open');
          btn.setAttribute('aria-expanded', 'true');
          var s = cardEl.querySelector('.task-steps'); if (s) s.hidden = false;
          if (stackToggle) stackToggle.firstChild.nodeValue = '收起步骤 ';
        }
      });
    });
    if (stackToggle) stackToggle.addEventListener('click', function () {
      var any = stack.querySelector('.task-card.is-open');
      if (any) closeStack();
      else {
        var first = stack.querySelector('.task-card__main');
        if (first) first.click();
      }
    });
  }

  document.querySelectorAll('#inspTasks .task-row__main').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var row = btn.closest('.task-row');
      var steps = row.querySelector('.task-row__steps');
      var open = btn.getAttribute('aria-expanded') === 'true';
      document.querySelectorAll('#inspTasks .task-row__main').forEach(function (b) {
        b.setAttribute('aria-expanded', 'false');
        var s = b.closest('.task-row').querySelector('.task-row__steps'); if (s) s.hidden = true;
      });
      if (!open && steps) { steps.hidden = false; btn.setAttribute('aria-expanded', 'true'); }
    });
  });

  var stackLink = document.getElementById('taskStackLink');
  if (stackLink && stack) stackLink.addEventListener('click', function () {
    var first = stack.querySelector('.task-card__main');
    if (first) first.click();
    stack.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  /* ---------------- empty state ---------------- */
  var params = new URLSearchParams(location.search);
  if (params.get('state') === 'empty') {
    if (stack) stack.hidden = true;
    var list = document.getElementById('inspTasks');
    if (list) list.innerHTML = '';
    var empty = document.getElementById('inspEmpty');
    if (empty) empty.hidden = false;
    var pill = document.querySelector('.status-pill');
    if (pill) pill.hidden = true;
    var link = document.getElementById('taskStackLink');
    if (link) link.hidden = true;
    var counter = document.querySelector('.insp-head .count');
    if (counter) counter.textContent = '0';
  }

  /* ---------------- scope segment ---------------- */
  document.querySelectorAll('.seg button').forEach(function (b) {
    b.addEventListener('click', function () {
      b.parentElement.querySelectorAll('button').forEach(function (x) { x.classList.remove('is-active'); });
      b.classList.add('is-active');
    });
  });

  /* ---------------- mobile drawer ---------------- */
  var menuBtn = document.getElementById('menuBtn');
  var sidebar = document.getElementById('sidebar');
  if (menuBtn && sidebar) menuBtn.addEventListener('click', function () { sidebar.classList.toggle('is-open'); });
  document.addEventListener('click', function (e) {
    if (window.innerWidth > 1100 || !sidebar) return;
    if (sidebar.classList.contains('is-open') && !sidebar.contains(e.target) && !menuBtn.contains(e.target)) {
      sidebar.classList.remove('is-open');
    }
  });

  /* ---------------- composer ---------------- */
  var input = document.getElementById('composerInput');
  var sendBtn = document.querySelector('.composer__send');
  function send() {
    var text = input && input.value.trim();
    if (!text) return;
    var row = document.createElement('article');
    row.className = 'msg is-user';
    row.setAttribute('data-role', 'user');
    row.innerHTML = '<span class="msg__avatar">你</span><div class="msg__body"><div class="msg__meta"><b>你</b><span class="sep">·</span><span>' + now() + '</span></div><div class="msg__text"><p></p></div></div>';
    row.querySelector('.msg__text p').textContent = text;
    messages.appendChild(row);
    input.value = '';
    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    showToast('已发送（原型演示）');
  }
  if (sendBtn) sendBtn.addEventListener('click', send);
  if (input) input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); }
  });

  /* ---------------- init ---------------- */
  buildTimeline();
  if (params.get('top') === '1') messages.scrollTop = 0;
  else messages.scrollTop = messages.scrollHeight;
  requestAnimationFrame(function () { layout(); });
})();
