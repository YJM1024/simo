/**
 * 本文件对应决策 D-01：终端输出适配（把内核事件渲染成可读的彩色 trace）。
 *
 * 决策内容：
 *  - 内核只发结构化事件；本文件是唯一知道"怎么给人看"的地方（可整体替换成 Web/日志适配器）；
 *  - 每条 trace 含：相对时间戳、层级缩进（depth）、角色标签（source/gate/policy/...）、
 *    语义图标（✓/✗/·/◌/▸/↳/...）、按事件类型着色；
 *  - 剧情分隔标题、banner、汇总面板也由本适配器渲染（demo 只发 demo/* 事件）；
 *  - 颜色策略：真实终端自动开启；重定向到文件自动关闭；--color / --no-color / FORCE_COLOR
 *    可覆盖（ANSI 转义在 Windows Terminal / pwsh 7 下可直接显示）。
 *
 * 它保证的不变量：
 *  - 渲染只读事件、不修改内核状态，也不产生新事件（无递归）；
 *  - 未登记的事件类型有兜底渲染（不会因为新增事件而崩掉 demo）；
 *  - 同一事件流渲染出的文本完全确定（时间戳来自事件 ts，不用 wall clock）。
 */

export const TRACE_WIDTH = 78;

const ANSI = Object.freeze({
  red: '31',
  green: '32',
  yellow: '33',
  blue: '34',
  magenta: '35',
  cyan: '36',
  gray: '90',
  bold: '1',
  dim: '2',
  boldCyan: '1;36',
  boldGreen: '1;32',
  boldRed: '1;31',
});

export function makePalette(useColor = false) {
  const paint = (code) => (text) => (useColor ? `\u001b[${code}m${text}\u001b[0m` : String(text));
  return {
    enabled: Boolean(useColor),
    plain: (text) => String(text),
    red: paint(ANSI.red),
    green: paint(ANSI.green),
    yellow: paint(ANSI.yellow),
    blue: paint(ANSI.blue),
    magenta: paint(ANSI.magenta),
    cyan: paint(ANSI.cyan),
    gray: paint(ANSI.gray),
    bold: paint(ANSI.bold),
    dim: paint(ANSI.dim),
    boldCyan: paint(ANSI.boldCyan),
    boldGreen: paint(ANSI.boldGreen),
  };
}

export function resolveColorPreference({ argv = process.argv, env = process.env, stream = process.stdout } = {}) {
  if (argv.includes('--no-color')) return false;
  if (argv.includes('--color')) return true;
  if (env.NO_COLOR && env.NO_COLOR !== '0') return false;
  if (env.FORCE_COLOR && env.FORCE_COLOR !== '0') return true;
  return Boolean(stream && stream.isTTY);
}

export const SYMBOLS = Object.freeze({
  success: '✓',
  failure: '✗',
  dot: '·',
  shadow: '◌',
  arrow: '▸',
  follow: '↳',
  bounce: '↺',
  tick: '＋',
  end: '■',
  grant: '⊕',
  release: '⊖',
  priority: '⇡',
  dispatch: '⏵',
  queued: '⏸',
  turn: '◆',
  context: '▤',
  mandate: '⎔',
  gate: '⚖',
  kernel: '⌂',
});

function pad(text, width) {
  const value = String(text);
  return value.length >= width ? value : value + ' '.repeat(width - value.length);
}

function short(text, max = 64) {
  const value = String(text ?? '').replace(/\s+/g, ' ').trim();
  return value.length <= max ? value : `${value.slice(0, Math.max(0, max - 1))}…`;
}

function rule(char, width = TRACE_WIDTH) {
  return char.repeat(width);
}

/**
 * 事件 -> 展示样式。
 * icon/color/role 可以是函数（读 payload）；text 负责把结构化 payload 转成一行人类可读文本。
 */
export const EVENT_STYLES = Object.freeze({
  'demo/banner': { special: 'banner' },
  'demo/section': { special: 'section' },
  'demo/summary': { special: 'summary' },
  'demo/note': { icon: SYMBOLS.dot, color: 'gray', role: 'demo', depth: 0, text: (p) => p.text },

  'kernel/open': {
    icon: SYMBOLS.kernel,
    color: 'gray',
    role: 'kernel',
    depth: 0,
    text: (p) => `内核装配完成 · 场景 ${p.scenario} · 策略版本 ${p.policyVersion} · state=${p.storePath} · 恢复 Ticket ${p.tickets} 条`,
  },

  'source/trigger': {
    icon: SYMBOLS.arrow,
    color: 'cyan',
    role: 'source',
    depth: 0,
    text: (p) => `${p.author?.name ?? '?'} @ ${p.threadKey}: "${short(p.text, 68)}"  (triggerId=${p.triggerId})`,
  },
  'source/message': {
    icon: SYMBOLS.dot,
    color: 'gray',
    role: 'source',
    depth: 1,
    text: (p) => `历史消息 ${p.author?.name ?? '?'} @ ${p.threadKey}: "${short(p.text, 56)}"`,
  },

  'gate/verdict': {
    icon: (p) => (p.verdict === 'notAdmitted' ? SYMBOLS.failure : p.verdict === 'inferred' ? SYMBOLS.dot : SYMBOLS.success),
    color: (p) => (p.verdict === 'notAdmitted' ? 'red' : p.verdict === 'inferred' ? 'yellow' : 'green'),
    role: 'gate',
    depth: 1,
    text: (p) => `${p.verdict}  rule=${p.rule}  ${p.reason}`,
  },
  'gate/drop': {
    icon: SYMBOLS.failure,
    color: 'red',
    role: 'gate',
    depth: 1,
    text: (p) => `drop：${p.reason}`,
  },

  'policy/mode': {
    icon: SYMBOLS.gate,
    color: 'blue',
    role: 'policy',
    depth: 1,
    text: (p) => `acceptMode=${p.mode}  策略版本 ${p.policyVersion}`,
  },
  'policy/would-accept': {
    icon: SYMBOLS.shadow,
    color: 'magenta',
    role: 'policy',
    depth: 1,
    text: (p) =>
      `would-accept ${p.triggerId}「${short(p.title, 40)}」影子模式：记录但不动手（不建 Ticket / 不派工；would-accept 记录共 ${p.wouldAcceptCount} 条）`,
  },
  'policy/mode-off': {
    icon: SYMBOLS.shadow,
    color: 'yellow',
    role: 'policy',
    depth: 1,
    text: () => 'acceptMode=off：准入关闭，本次 Trigger 不评估、不落影子记录',
  },

  'assessment/result': {
    icon: (p) => (p.accept ? SYMBOLS.success : SYMBOLS.failure),
    color: (p) => (p.accept ? 'green' : 'yellow'),
    role: 'assess',
    depth: 1,
    text: (p) => `Assessment ${p.accept ? 'accept' : 'ignore'} · ${p.reason}${p.title ? ` · title="${p.title}"` : ''}`,
  },

  'dedupe/hit': {
    icon: '=',
    color: 'yellow',
    role: 'dedupe',
    depth: 1,
    text: (p) => `Trigger ${p.triggerId} 已处理过 → 复用 Ticket ${p.ticketId}，不再建票`,
  },
  'route/passthrough': {
    icon: SYMBOLS.follow,
    color: 'blue',
    role: 'route',
    depth: 1,
    text: (p) => `thread ${p.threadKey} 已有 open Ticket ${p.ticketId} → 订阅直投（跳过 Router / Assessment）`,
  },

  'ticket/created': {
    icon: SYMBOLS.tick,
    color: 'green',
    role: 'ticket',
    depth: 1,
    text: (p) => `${p.ticketId}  stage=${p.stage}  thread=${p.threadKey}  "${short(p.title, 44)}"`,
  },
  'mandate/issued': {
    icon: SYMBOLS.mandate,
    color: 'blue',
    role: 'mandate',
    depth: 2,
    text: (p) => `${p.mandateId}  scope=${p.scope}  policy=${p.policyVersion}（授权范围 = 本 Ticket）`,
  },
  'ticket/input': {
    icon: SYMBOLS.follow,
    color: 'cyan',
    role: 'ticket',
    depth: 2,
    text: (p) => `${p.ticketId} 追加输入：「${short(p.text, 60)}」`,
  },
  'ticket/stage': {
    icon: '→',
    color: (p) => (String(p.to).startsWith('person/') ? 'magenta' : 'blue'),
    role: 'ticket',
    depth: 2,
    text: (p) => `${p.ticketId}  ${p.from} → ${p.to}${p.reason ? `  （${p.reason}）` : ''}`,
  },
  'ticket/bounced': {
    icon: SYMBOLS.bounce,
    color: 'red',
    role: 'accept',
    depth: 2,
    text: (p) => `${p.ticketId} 验收门拦截：退回 working，缺失证据 [${p.missing.join('、')}]（第 ${p.round}/${p.maxRounds} 轮）`,
  },
  'ticket/ended': {
    icon: SYMBOLS.end,
    color: 'green',
    role: 'ticket',
    depth: 2,
    text: (p) => `${p.ticketId} ended · ${p.reason}${p.by ? ` by ${p.by}` : ''}`,
  },

  'acceptance/passed': {
    icon: SYMBOLS.success,
    color: 'green',
    role: 'accept',
    depth: 2,
    text: (p) => `${p.ticketId} 证据齐全（${p.contractId}）→ 签发 clearance ${p.clearanceId}`,
  },
  'acceptance/rejected': {
    icon: SYMBOLS.failure,
    color: 'red',
    role: 'accept',
    depth: 2,
    text: (p) => `${p.ticketId} 不满足 ${p.contractId}：缺 ${p.missing.length} 项 [${p.missing.join('、')}]`,
  },

  'scheduler/dispatch': {
    icon: SYMBOLS.dispatch,
    color: 'blue',
    role: 'sched',
    depth: 1,
    text: (p) => `dispatch 候选任务 ${p.candidates} 个${p.ticketIds?.length ? `  [${p.ticketIds.join(', ')}]` : ''}`,
  },
  'scheduler/queued': {
    icon: SYMBOLS.queued,
    color: 'yellow',
    role: 'sched',
    depth: 1,
    text: (p) => `${p.kind} ${p.key} 排队等 slot（worker ${p.workersUsed}/${p.maxWorkers}，排队人=${p.waitingHumans}，排队任务=${p.waitingWorkers}）`,
  },
  'scheduler/slot-grant': {
    icon: SYMBOLS.grant,
    color: 'green',
    role: 'sched',
    depth: 1,
    text: (p) =>
      `grant ${p.kind} ${p.key} → ${p.grantId}${p.overflow ? '  【+1 人优先 slot：worker slot 全满也立刻处理】' : ''}  worker ${p.workersUsed}/${p.maxWorkers}`,
  },
  'scheduler/slot-release': {
    icon: SYMBOLS.release,
    color: 'gray',
    role: 'sched',
    depth: 1,
    text: (p) => `release ${p.kind} ${p.key}  worker ${p.workersUsed}/${p.maxWorkers}  空位=${p.free}`,
  },
  'scheduler/priority': {
    icon: SYMBOLS.priority,
    color: 'magenta',
    role: 'sched',
    depth: 1,
    text: (p) => `人优先：${p.key} 抢占刚空出的普通 slot（超前排队任务 ${p.waitingWorkers} 个）`,
  },

  'agent/turn': {
    icon: SYMBOLS.turn,
    color: 'cyan',
    role: (p) => p.role,
    depth: 2,
    text: (p) =>
      `${p.turnId} task=${p.taskKind}${p.state ? ` state=${p.state}` : ''}${
        p.verdict?.accept !== undefined ? ` accept=${p.verdict.accept}` : ''
      }${p.verdict?.approve !== undefined ? ` approve=${p.verdict.approve}` : ''} toolCalls=${p.actions} llmCalls=${p.usage?.llmCalls ?? 1}`,
  },
  'context/assembled': {
    icon: SYMBOLS.context,
    color: 'gray',
    role: 'context',
    depth: 2,
    text: (p) => `thread ${p.threadKey}  inline=${p.inline} spill=${p.spill}  chars=${p.chars}/${p.budget}${p.phase ? `  (${p.phase})` : ''}`,
  },

  'human/message': {
    icon: SYMBOLS.dot,
    color: 'magenta',
    role: 'person',
    depth: 1,
    text: (p) => `${p.from}：${short(p.text, 70)}${p.ticketId ? `  (Ticket ${p.ticketId})` : ''}`,
  },
  'human/decision': {
    icon: SYMBOLS.success,
    color: 'green',
    role: 'person',
    depth: 1,
    text: (p) => `${p.by} 决定 ${p.decision} → ${p.ticketId}  ${p.from} → ${p.to}`,
  },
});

function createRenderer({ out, palette, width = TRACE_WIDTH }) {
  let baseTs = null;
  const lines = [];

  function write(line = '') {
    lines.push(line);
    out.write(`${line}\n`);
  }

  function timeLabel(ts) {
    if (baseTs === null) baseTs = ts;
    const relative = Math.max(0, ts - baseTs) / 1000;
    return `[+${relative.toFixed(3).padStart(6, '0')}s]`;
  }

  function renderSection(payload) {
    write();
    write(palette.gray(rule('─', width)));
    write(palette.boldCyan(` 剧情 ${payload.id} · ${payload.title}`));
    if (payload.note) write(palette.dim(`   ${payload.note}`));
    write(palette.gray(rule('─', width)));
  }

  function renderBanner(payload) {
    write();
    write(palette.boldCyan(rule('━', width)));
    (payload.lines ?? []).forEach((line, index) => {
      write(index === 0 ? palette.boldCyan(` ${line}`) : ` ${line}`);
    });
    if (payload.tagline) write(palette.dim(` ${payload.tagline}`));
    write(palette.boldCyan(rule('━', width)));
  }

  function renderSummary(payload) {
    write();
    write(palette.boldCyan(rule('━', width)));
    write(palette.boldCyan(` ${payload.title}`));
    for (const check of payload.checks ?? []) {
      write(`  ${check.ok ? palette.green(SYMBOLS.success) : palette.red(SYMBOLS.failure)} ${check.text}`);
    }
    const stats = payload.stats ?? [];
    if (stats.length > 0) {
      write();
      for (const stat of stats) write(palette.dim(` · ${stat}`));
    }
    write(palette.boldCyan(rule('━', width)));
  }

  function renderFallback(event) {
    write(`${palette.dim(timeLabel(event.ts))} ${palette.gray(pad(String(event.type).split('/')[0], 7))} ${palette.dim(event.type)} ${JSON.stringify(event.payload)}`);
  }

  function render(event) {
    const style = EVENT_STYLES[event.type];
    if (!style) return renderFallback(event);
    if (style.special === 'section') return renderSection(event.payload);
    if (style.special === 'banner') return renderBanner(event.payload);
    if (style.special === 'summary') return renderSummary(event.payload);

    const payload = event.payload ?? {};
    const icon = typeof style.icon === 'function' ? style.icon(payload) : style.icon ?? SYMBOLS.dot;
    const colorName = typeof style.color === 'function' ? style.color(payload) : style.color ?? 'plain';
    const role = typeof style.role === 'function' ? style.role(payload) : style.role ?? String(event.type).split('/')[0];
    const depth = style.depth ?? 0;
    const colorize = palette[colorName] ?? palette.plain;
    const text = style.text ? style.text(payload) : JSON.stringify(payload);
    const indent = '  '.repeat(Math.max(0, depth));
    write(`${palette.dim(timeLabel(event.ts))} ${indent}${colorize(icon)} ${palette.dim(pad(role, 7))} ${text}`);
  }

  return { render, lines: () => [...lines] };
}

/**
 * 订阅总线上的一切事件并渲染。
 * @returns {{detach:() => void, palette:object, renderer:object}}
 */
export function createCliAdapter({ bus, out = process.stdout, color = resolveColorPreference(), width = TRACE_WIDTH } = {}) {
  if (!bus || typeof bus.onAny !== 'function') throw new TypeError('D-01: createCliAdapter 需要事件总线');
  const palette = makePalette(color);
  const renderer = createRenderer({ out, palette, width });
  const subscription = bus.onAny((event) => renderer.render(event));
  return {
    detach: () => subscription.off(),
    palette,
    renderer,
  };
}
