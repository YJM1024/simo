#!/usr/bin/env node
// measure-net.mjs —— 零依赖 TCP 网络测量：延迟、抖动、丢包、带宽。
// 用法见 usage()。退出码：0 正常；1 连接失败；2 超阈值；3 参数或环境错误。

import net from 'node:net';
import { EventEmitter } from 'node:events';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const MODES = ['latency', 'jitter', 'loss', 'bandwidth'];
const ERROR_KINDS = ['refused', 'timeout', 'dns', 'reset', 'unreachable', 'other'];
const MAX_COUNT = 10000;
const MAX_SIZE = 16 * 1024 * 1024;

class UsageError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UsageError';
  }
}

function usage() {
  console.log(`用法：
  node scripts/measure-net.mjs --target <host:port> [--mode latency|jitter|loss|bandwidth]
      [--count 20] [--size 1024] [--timeout 3000] [--threshold <key><op><数值>]
      [--out <file>] [--self-test]

模式：
  latency   连续建立 --count 次 TCP 连接，统计建连耗时 p50/p95/p99/min/max/mean 与成功率
  jitter    同 latency 取样本，另给耗时标准差与相邻两次耗时差
  loss      连续 --count 次建连，统计失败次数与原因（refused/timeout/dns/reset/unreachable/other）
  bandwidth 向可回显的 TCP 目标发送 --size 字节并测吞吐；目标须原样回显，不回显时报
            “该模式需要可写目标”并退 3

阈值：
  --threshold p95=480       统计量不超过阈值（latency/jitter 可用 p50/p95/p99/min/max/mean）
  --threshold loss<=8       loss 模式丢包百分比不超过 8
  --threshold loss>=99      断网档要求丢包不低于 99
  --threshold mbps>=0.8     bandwidth 模式吞吐不低于 0.8 Mbps

退出码：0 正常；1 连接失败（未设阈值时）；2 超阈值；3 参数或环境错误。
输出：JSON 含 mode/target/samples/stats/errors/params/startedAt/durationMs；给 --out 时写文件，
      否则写 stdout；一行摘要始终打印（JSON 写 stdout 时摘要走 stderr）。`);
}

function parseTarget(raw) {
  if (!raw || typeof raw !== 'string') throw new UsageError('缺少 --target <host:port>');
  const index = raw.lastIndexOf(':');
  if (index <= 0 || index === raw.length - 1) {
    throw new UsageError(`--target 需要 host:port 形式，收到 ${raw}`);
  }
  let host = raw.slice(0, index);
  if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1);
  if (!host) throw new UsageError(`--target 的主机名为空，收到 ${raw}`);
  const port = Number(raw.slice(index + 1));
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new UsageError(`--target 的端口须为 1 到 65535 的整数，收到 ${raw}`);
  }
  const text = `${host.includes(':') ? `[${host}]` : host}:${port}`;
  return { host, port, text };
}

function parseThreshold(raw) {
  const match = /^([a-z0-9]+)(<=|>=|=)(-?\d+(?:\.\d+)?)$/.exec(String(raw));
  if (!match) {
    throw new UsageError(`--threshold 需要 <key><op><数值> 形式，例如 p95=480 或 loss>=99，收到 ${raw}`);
  }
  const key = match[1];
  const op = match[2] || '=';
  const value = Number(match[3]);
  if (!Number.isFinite(value) || value < 0) {
    throw new UsageError(`--threshold 的数值须为非负数，收到 ${raw}`);
  }
  return { key, op, value, raw: `${key}${op}${value}` };
}

function toInteger(raw, name, min, max) {
  if (!/^\d+$/.test(String(raw))) throw new UsageError(`--${name} 需要整数，收到 ${raw}`);
  const value = Number(raw);
  if (value < min || value > max) throw new UsageError(`--${name} 取值须在 ${min} 到 ${max} 之间，收到 ${raw}`);
  return value;
}

function parseArgs(argv) {
  const opts = {
    mode: 'latency',
    count: 20,
    size: 1024,
    timeoutMs: 3000,
    target: null,
    out: null,
    threshold: null,
    selfTest: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') {
      opts.help = true;
      continue;
    }
    if (!arg.startsWith('--')) throw new UsageError(`无法识别的参数 ${arg}`);
    let key = arg.slice(2);
    let value = null;
    const eq = key.indexOf('=');
    if (eq >= 0) {
      value = key.slice(eq + 1);
      key = key.slice(0, eq);
    }
    const take = () => {
      if (value !== null) return value;
      if (i + 1 >= argv.length) throw new UsageError(`--${key} 缺少取值`);
      i += 1;
      return argv[i];
    };
    switch (key) {
      case 'target':
        opts.target = parseTarget(take());
        break;
      case 'mode': {
        const mode = take();
        if (!MODES.includes(mode)) throw new UsageError(`--mode 只能是 ${MODES.join('/')}，收到 ${mode}`);
        opts.mode = mode;
        break;
      }
      case 'count':
        opts.count = toInteger(take(), 'count', 1, MAX_COUNT);
        break;
      case 'size':
        opts.size = toInteger(take(), 'size', 1, MAX_SIZE);
        break;
      case 'timeout':
        opts.timeoutMs = toInteger(take(), 'timeout', 1, 600000);
        break;
      case 'threshold':
        opts.threshold = parseThreshold(take());
        break;
      case 'out':
        opts.out = take();
        break;
      case 'self-test':
        if (value !== null) throw new UsageError('--self-test 不带取值');
        opts.selfTest = true;
        break;
      default:
        throw new UsageError(`未知参数 --${key}`);
    }
  }
  if (opts.help) return opts;
  if (opts.selfTest) return opts;
  if (!opts.target) throw new UsageError('缺少 --target <host:port>');
  validateThreshold(opts.mode, opts.threshold);
  return opts;
}

function validateThreshold(mode, threshold) {
  if (!threshold) return;
  const allowed = mode === 'loss' ? ['loss'] : mode === 'bandwidth' ? ['mbps'] : ['p50', 'p95', 'p99', 'min', 'max', 'mean'];
  if (!allowed.includes(threshold.key)) {
    throw new UsageError(`--mode ${mode} 的 --threshold 只支持 ${allowed.join('/')}，收到 ${threshold.key}`);
  }
  if ((mode === 'latency' || mode === 'jitter') && threshold.op === '>=') {
    throw new UsageError('延迟与抖动阈值只支持不高于判定（= 或 <=）');
  }
  if (mode === 'bandwidth' && threshold.op !== '>=') {
    throw new UsageError('带宽阈值只支持不低于判定（>=）');
  }
}

function round(value, digits = 3) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const rank = (p / 100) * (sorted.length - 1);
  const low = Math.floor(rank);
  const high = Math.ceil(rank);
  if (low === high) return sorted[low];
  return sorted[low] + (sorted[high] - sorted[low]) * (rank - low);
}

function summarize(values) {
  const count = values.length;
  if (!count) return { count: 0, min: null, max: null, mean: null, p50: null, p95: null, p99: null };
  const sorted = [...values].sort((a, b) => a - b);
  const sum = values.reduce((acc, value) => acc + value, 0);
  return {
    count,
    min: round(sorted[0]),
    max: round(sorted[count - 1]),
    mean: round(sum / count),
    p50: round(percentile(sorted, 50)),
    p95: round(percentile(sorted, 95)),
    p99: round(percentile(sorted, 99)),
  };
}

function stddev(values, mean) {
  if (values.length < 2) return 0;
  const sum = values.reduce((acc, value) => acc + (value - mean) ** 2, 0);
  return Math.sqrt(sum / (values.length - 1));
}

function classifyError(code) {
  switch (code) {
    case 'ECONNREFUSED':
      return 'refused';
    case 'ETIMEDOUT':
    case 'ESOCKETTIMEDOUT':
      return 'timeout';
    case 'ENOTFOUND':
    case 'EAI_AGAIN':
    case 'EAI_FAIL':
    case 'ENODATA':
    case 'EAI_NODATA':
      return 'dns';
    case 'ECONNRESET':
    case 'EPIPE':
      return 'reset';
    case 'EHOSTUNREACH':
    case 'ENETUNREACH':
    case 'EACCES':
    case 'EADDRNOTAVAIL':
      return 'unreachable';
    default:
      return 'other';
  }
}

function probeConnect(target, timeoutMs, connectFn = net.connect) {
  return new Promise((resolvePromise) => {
    const started = process.hrtime.bigint();
    let socket = null;
    let settled = false;
    const elapsedMs = () => Number(process.hrtime.bigint() - started) / 1e6;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (socket) {
        socket.removeAllListeners('connect');
        socket.removeAllListeners('error');
        socket.on('error', () => {});
        try {
          socket.destroy();
        } catch {
          // 销毁失败不影响测量结果
        }
      }
      resolvePromise({ ...result, ms: round(elapsedMs()) });
    };
    const timer = setTimeout(() => {
      finish({ ok: false, kind: 'timeout', code: 'ETIMEDOUT', message: `连接超时（超过 ${timeoutMs} 毫秒）` });
    }, timeoutMs);
    try {
      socket = connectFn({ host: target.host, port: target.port });
    } catch (err) {
      finish({ ok: false, kind: classifyError(err.code), code: err.code || 'ERR', message: err.message });
      return;
    }
    socket.once('connect', () => finish({ ok: true, kind: 'ok', code: 'OK', message: '' }));
    socket.once('error', (err) => {
      finish({ ok: false, kind: classifyError(err.code), code: err.code || 'ERR', message: err.message });
    });
  });
}

async function runLatency(target, count, timeoutMs) {
  const samples = [];
  const errors = [];
  const values = [];
  for (let index = 0; index < count; index += 1) {
    const result = await probeConnect(target, timeoutMs);
    samples.push({ index, ok: result.ok, ms: result.ms, kind: result.kind, code: result.code });
    if (result.ok) {
      values.push(result.ms);
    } else {
      errors.push({ index, kind: result.kind, code: result.code, message: result.message, ms: result.ms });
    }
  }
  const stats = summarize(values);
  stats.success = values.length;
  stats.failures = errors.length;
  stats.successRate = round((values.length / count) * 100, 2);
  return { mode: 'latency', target: target.text, samples, stats, errors };
}

async function runJitter(target, count, timeoutMs) {
  const run = await runLatency(target, count, timeoutMs);
  const values = run.samples.filter((sample) => sample.ok).map((sample) => sample.ms);
  const diffs = values.slice(1).map((value, index) => round(Math.abs(value - values[index])));
  const adjacent = summarize(diffs);
  run.stats.stddev = round(stddev(values, run.stats.mean));
  run.stats.jitterMs = run.stats.stddev;
  run.stats.adjacent = {
    count: adjacent.count,
    min: adjacent.min,
    max: adjacent.max,
    mean: adjacent.mean,
    p50: adjacent.p50,
    p95: adjacent.p95,
  };
  run.mode = 'jitter';
  return run;
}

async function runLoss(target, count, timeoutMs) {
  const samples = [];
  const errors = [];
  const byKind = Object.fromEntries(ERROR_KINDS.map((kind) => [kind, 0]));
  for (let index = 0; index < count; index += 1) {
    const result = await probeConnect(target, timeoutMs);
    samples.push({ index, ok: result.ok, ms: result.ms, kind: result.ok ? 'ok' : result.kind, code: result.code });
    if (!result.ok) {
      byKind[result.kind] = (byKind[result.kind] || 0) + 1;
      errors.push({ index, kind: result.kind, code: result.code, message: result.message, ms: result.ms });
    }
  }
  const failures = errors.length;
  return {
    mode: 'loss',
    target: target.text,
    samples,
    errors,
    stats: {
      attempts: count,
      successes: count - failures,
      failures,
      lossRate: round(failures / count, 4),
      lossPercent: round((failures / count) * 100, 2),
      byKind,
      count: count - failures,
    },
  };
}

function runBandwidth(target, size, timeoutMs) {
  return new Promise((resolvePromise) => {
    const payload = Buffer.alloc(size, 0x61);
    const samples = [];
    const errors = [];
    const startedConnect = process.hrtime.bigint();
    let socket = null;
    let settled = false;
    let received = 0;
    let connectMs = null;
    let transferStart = null;
    let timer = null;

    const settle = (failure) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (socket) {
        socket.removeAllListeners('data');
        socket.removeAllListeners('error');
        socket.removeAllListeners('close');
        socket.on('error', () => {});
        try {
          socket.destroy();
        } catch {
          // 销毁失败不影响测量结果
        }
      }
      const transferMs = transferStart === null ? null : round(Number(process.hrtime.bigint() - transferStart) / 1e6);
      const ok = !failure;
      const stats = {
        bytesSent: size,
        bytesReceived: received,
        connectMs: connectMs === null ? null : round(connectMs),
        transferMs,
        throughputMbps: ok && transferMs > 0 ? round((received * 8) / transferMs / 1000) : null,
        throughputKBps: ok && transferMs > 0 ? round(received / 1024 / (transferMs / 1000)) : null,
        count: ok ? 1 : 0,
      };
      samples.push({
        index: 0,
        ok,
        bytes: received,
        connectMs: stats.connectMs,
        transferMs,
        throughputMbps: stats.throughputMbps,
      });
      if (failure) {
        errors.push({ index: 0, kind: failure.kind, code: failure.code, message: failure.message, ms: transferMs });
      }
      resolvePromise({ mode: 'bandwidth', target: target.text, samples, errors, stats });
    };

    timer = setTimeout(() => {
      settle({
        kind: 'unwritable',
        code: 'ENOECHO',
        message: `该模式需要可写目标：${timeoutMs} 毫秒内未回显 ${size} 字节，目标可能是只读服务`,
      });
    }, timeoutMs);
    try {
      socket = net.connect({ host: target.host, port: target.port });
    } catch (err) {
      settle({ kind: classifyError(err.code), code: err.code || 'ERR', message: err.message });
      return;
    }
    socket.once('connect', () => {
      connectMs = Number(process.hrtime.bigint() - startedConnect) / 1e6;
      transferStart = process.hrtime.bigint();
      socket.write(payload);
    });
    socket.on('data', (chunk) => {
      received += chunk.length;
      if (received >= size) settle(null);
    });
    socket.once('error', (err) => {
      settle({ kind: classifyError(err.code), code: err.code || 'ERR', message: err.message });
    });
    socket.once('close', () => {
      if (settled) return;
      settle({
        kind: transferStart === null ? 'closed' : 'unwritable',
        code: 'ECONNCLOSED',
        message:
          transferStart === null
            ? '连接在建立前关闭'
            : `该模式需要可写目标：目标在回显完成前关闭（已收 ${received}/${size} 字节）`,
      });
    });
  });
}

async function runMode(opts) {
  const startedAt = new Date().toISOString();
  const started = process.hrtime.bigint();
  let run;
  if (opts.mode === 'latency') run = await runLatency(opts.target, opts.count, opts.timeoutMs);
  else if (opts.mode === 'jitter') run = await runJitter(opts.target, opts.count, opts.timeoutMs);
  else if (opts.mode === 'loss') run = await runLoss(opts.target, opts.count, opts.timeoutMs);
  else run = await runBandwidth(opts.target, opts.size, opts.timeoutMs);
  run.startedAt = startedAt;
  run.durationMs = round(Number(process.hrtime.bigint() - started) / 1e6);
  return run;
}

function thresholdValue(run, key) {
  if (key === 'loss') return run.stats.lossPercent;
  if (key === 'mbps') return run.stats.throughputMbps;
  return Object.prototype.hasOwnProperty.call(run.stats, key) ? run.stats[key] : null;
}

function thresholdViolated(value, threshold) {
  if (threshold.op === '>=') return value < threshold.value;
  return value > threshold.value;
}

function decideExit(run, threshold) {
  if (run.mode === 'bandwidth' && run.errors.some((error) => error.kind === 'unwritable')) return 3;
  if (run.mode !== 'loss' && run.stats.count === 0) return 1;
  if (threshold) {
    const value = thresholdValue(run, threshold.key);
    if (typeof value !== 'number' || !Number.isFinite(value)) return 1;
    if (thresholdViolated(value, threshold)) return 2;
  }
  if (run.mode === 'loss') return 0;
  if (run.errors.length > 0) return 1;
  return 0;
}

function toPayload(run, opts) {
  return {
    mode: run.mode,
    target: run.target,
    samples: run.samples,
    stats: run.stats,
    errors: run.errors,
    params: {
      count: opts.count,
      size: opts.size,
      timeoutMs: opts.timeoutMs,
      threshold: opts.threshold ? opts.threshold.raw : null,
    },
    startedAt: run.startedAt,
    durationMs: run.durationMs,
  };
}

function fmt(value) {
  return value === null || value === undefined ? 'n/a' : String(value);
}

function fmtMs(value) {
  return value === null || value === undefined ? 'n/a' : `${value}ms`;
}

function summaryLine(payload, exitCode) {
  const stats = payload.stats;
  const parts = [`mode=${payload.mode}`, `target=${payload.target}`];
  if (payload.mode === 'latency' || payload.mode === 'jitter') {
    parts.push(
      `samples=${stats.count}`,
      `success=${fmt(stats.successRate)}%`,
      `p50=${fmtMs(stats.p50)}`,
      `p95=${fmtMs(stats.p95)}`,
      `p99=${fmtMs(stats.p99)}`,
      `mean=${fmtMs(stats.mean)}`,
    );
    if (payload.mode === 'jitter') parts.push(`stddev=${fmtMs(stats.stddev)}`);
  } else if (payload.mode === 'loss') {
    parts.push(
      `attempts=${stats.attempts}`,
      `failures=${stats.failures}`,
      `loss=${fmt(stats.lossPercent)}%`,
      `kinds=${Object.entries(stats.byKind)
        .filter(([, count]) => count > 0)
        .map(([kind, count]) => `${kind}:${count}`)
        .join(',') || 'none'}`,
    );
  } else {
    parts.push(
      `bytes=${stats.bytesReceived}/${stats.bytesSent}`,
      `mbps=${fmt(stats.throughputMbps)}`,
      `connect=${fmtMs(stats.connectMs)}`,
    );
  }
  parts.push(`errors=${payload.errors.length}`, `exit=${exitCode}`);
  return `[measure-net] ${parts.join(' ')}`;
}

function writePayloadFile(file, payload) {
  const target = resolve(file);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function emit(payload, opts, exitCode) {
  const summary = summaryLine(payload, exitCode);
  if (opts.out) {
    writePayloadFile(opts.out, payload);
    console.log(summary);
    console.error(`已写入 JSON：${resolve(opts.out)}`);
  } else {
    console.log(JSON.stringify(payload, null, 2));
    console.error(summary);
  }
}

async function execute(argv) {
  const opts = parseArgs(argv);
  const run = await runMode(opts);
  return { opts, run, exitCode: decideExit(run, opts.threshold) };
}

async function selfTest() {
  const assertions = [];
  const check = (label, ok, detail = '') => {
    assertions.push({ label, ok: Boolean(ok) });
    console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  };
  const servers = [];
  const listen = (server) =>
    new Promise((resolveListen) => {
      server.listen(0, '127.0.0.1', () => resolveListen(server.address().port));
    });
  const close = (server) =>
    new Promise((resolveClose) => {
      const timer = setTimeout(resolveClose, 1000);
      server.close(() => {
        clearTimeout(timer);
        resolveClose();
      });
      if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
    });

  const echo = net.createServer((socket) => {
    socket.on('error', () => {});
    socket.on('data', (chunk) => socket.write(chunk));
  });
  const silent = net.createServer((socket) => {
    socket.on('error', () => {});
  });
  servers.push(echo, silent);

  try {
    const echoPort = await listen(echo);
    const silentPort = await listen(silent);
    const echoTarget = parseTarget(`127.0.0.1:${echoPort}`);
    const silentTarget = parseTarget(`127.0.0.1:${silentPort}`);

    check('parseTarget 解析 host:port', parseTarget('127.0.0.1:8080').port === 8080);
    check('parseTarget 解析 IPv6 括号形式', parseTarget('[::1]:443').host === '::1');
    check('parseTarget 拒绝缺少端口', (() => { try { parseTarget('127.0.0.1'); return false; } catch (err) { return err instanceof UsageError; } })());
    const parsed = parseArgs(['--target=127.0.0.1:9', '--count=5', '--mode=loss']);
    check('parseArgs 支持 --flag=value', parsed.count === 5 && parsed.mode === 'loss' && parsed.target.port === 9);
    check('parseThreshold 默认按不超过判定', parseThreshold('p95=480').op === '=');
    check('parseThreshold 支持下界判定', (() => { const threshold = parseThreshold('loss>=99'); return threshold.key === 'loss' && threshold.op === '>=' && threshold.value === 99; })());
    check('parseThreshold 拒绝非法写法', (() => { try { parseThreshold('p95'); return false; } catch (err) { return err instanceof UsageError; } })());
    check('DNS 错误归类', classifyError('ENOTFOUND') === 'dns');

    const latencyRun = await runLatency(echoTarget, 5, 1000);
    check('latency 样本数等于 count', latencyRun.samples.length === 5);
    check('latency 成功率为 100%', latencyRun.stats.successRate === 100);
    check('latency 成功样本数正确', latencyRun.stats.count === 5);
    check(
      'latency 分位有序且不超过最大值',
      latencyRun.stats.p50 <= latencyRun.stats.p95 &&
        latencyRun.stats.p95 <= latencyRun.stats.p99 &&
        latencyRun.stats.p99 <= latencyRun.stats.max,
    );

    const jitterRun = await runJitter(echoTarget, 5, 1000);
    check('jitter 给出标准差', Number.isFinite(jitterRun.stats.stddev) && jitterRun.stats.stddev >= 0);
    check('jitter 相邻差样本数为 count-1', jitterRun.stats.adjacent.count === 4);

    const lossRun = await runLoss(echoTarget, 5, 1000);
    check('loss 全成功时丢包率为 0', lossRun.stats.failures === 0 && lossRun.stats.lossPercent === 0);
    check('loss 失败原因分类字段齐全', ERROR_KINDS.every((kind) => kind in lossRun.stats.byKind));

    const bandwidthRun = await runBandwidth(echoTarget, 2048, 2000);
    check('bandwidth 回显字节数等于发送量', bandwidthRun.stats.bytesReceived === 2048);
    check('bandwidth 吞吐为正数', bandwidthRun.stats.throughputMbps > 0);
    check('bandwidth 成功样本数为 1', bandwidthRun.stats.count === 1);

    const silentRun = await runBandwidth(silentTarget, 512, 300);
    check('bandwidth 对只读目标记 unwritable', silentRun.errors[0] && silentRun.errors[0].kind === 'unwritable');
    check(
      'bandwidth 只读目标报“该模式需要可写目标”',
      String(silentRun.errors[0] && silentRun.errors[0].message).includes('该模式需要可写目标'),
    );
    check('bandwidth 只读目标退 3', decideExit(silentRun, null) === 3);

    const freePort = await new Promise((resolveFree) => {
      const probe = net.createServer();
      probe.listen(0, '127.0.0.1', () => {
        const port = probe.address().port;
        probe.close(() => resolveFree(port));
      });
    });
    const refusedRun = await runLatency(parseTarget(`127.0.0.1:${freePort}`), 2, 1000);
    check('拒绝连接归类为 refused', refusedRun.errors.length === 2 && refusedRun.errors[0].kind === 'refused');
    check('拒绝连接退 1', decideExit(refusedRun, null) === 1);

    const fakeConnect = () => {
      const socket = new EventEmitter();
      socket.destroy = () => {};
      return socket;
    };
    const timeoutResult = await probeConnect(echoTarget, 120, fakeConnect);
    check('连接超时归类为 timeout', timeoutResult.ok === false && timeoutResult.kind === 'timeout');
    check('连接超时耗时达到 timeout 量级', timeoutResult.ms >= 100);

    const payload = toPayload(latencyRun, {
      count: 5,
      size: 1024,
      timeoutMs: 1000,
      threshold: null,
    });
    const fields = ['mode', 'target', 'samples', 'stats', 'errors', 'params', 'startedAt', 'durationMs'];
    check('JSON 顶层字段齐全', fields.every((field) => field in payload));
    check('JSON 可序列化回读', JSON.parse(JSON.stringify(payload)).mode === 'latency');
    const outFile = join(tmpdir(), `measure-net-self-test-${process.pid}.json`);
    writePayloadFile(outFile, payload);
    check('--out 写出的 JSON 可回读', JSON.parse(readFileSync(outFile, 'utf8')).params.count === 5);

    const synthetic = {
      mode: 'latency',
      stats: { count: 5, min: 10, max: 200, mean: 80, p50: 70, p95: 150, p99: 190 },
      errors: [],
    };
    check('阈值超限退 2', decideExit(synthetic, { key: 'p95', op: '=', value: 100 }) === 2);
    check('阈值内退 0', decideExit(synthetic, { key: 'p95', op: '=', value: 200 }) === 0);
    check(
      '下界阈值未达退 2',
      decideExit(
        { mode: 'loss', stats: { lossPercent: 50, count: 0 }, errors: [], samples: [{}] },
        { key: 'loss', op: '>=', value: 99 },
      ) === 2,
    );
    check('缺少 target 抛 UsageError', (() => { try { parseArgs(['--mode', 'latency']); return false; } catch (err) { return err instanceof UsageError; } })());
  } finally {
    await Promise.all(servers.map((server) => close(server)));
  }

  const failed = assertions.filter((item) => !item.ok).length;
  const summary =
    failed === 0
      ? `SELF-TEST PASS (${assertions.length} assertions)`
      : `SELF-TEST FAILED (${failed}/${assertions.length} assertions)`;
  await new Promise((resolveWrite) => {
    const timer = setTimeout(resolveWrite, 200);
    process.stdout.write(`${summary}\n`, () => {
      clearTimeout(timer);
      resolveWrite();
    });
  });
  return failed === 0 ? 0 : 1;
}

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    if (err instanceof UsageError) {
      console.error(`参数错误：${err.message}`);
      usage();
      process.exit(3);
    }
    throw err;
  }
  if (opts.help) {
    usage();
    process.exit(0);
  }
  if (opts.selfTest) {
    process.exitCode = await selfTest();
    return;
  }
  try {
    const run = await runMode(opts);
    const exitCode = decideExit(run, opts.threshold);
    const unwritable = run.errors.find((error) => error.kind === 'unwritable');
    if (unwritable) console.error(`该模式需要可写目标：${unwritable.message.replace(/^该模式需要可写目标：/, '')}`);
    emit(toPayload(run, opts), opts, exitCode);
    process.exit(exitCode);
  } catch (err) {
    console.error(`环境错误：${err && err.message ? err.message : err}`);
    process.exit(3);
  }
}

main();
