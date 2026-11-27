#!/usr/bin/env node
// probe-cdp.mjs - check whether a Chrome DevTools Protocol endpoint is reachable.
//
//   node scripts/probe-cdp.mjs            # probe 127.0.0.1:9223 (or $AC_CDP_PORT), launch headless Chrome if needed
//   node scripts/probe-cdp.mjs --port 9250  # probe an explicit port, overrides $AC_CDP_PORT
//   node scripts/probe-cdp.mjs --json     # machine-readable result
//   node scripts/probe-cdp.mjs --self-test  # verify the failure path returns exit 3 without throwing
//
// Exit codes: 0 = CDP reachable, 3 = environment unavailable (caller should mark the task
// blocked instead of retrying in place), 2 = bad arguments, 1 = self-test failed.

import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';



const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = path.join(ROOT, '.tmp');
const DEFAULT_PORT = 9223;
const WAIT_MS = 20000;
const MAX_LAUNCHES = 2;

// 每个端口一套日志与 user-data-dir：同一 user-data-dir 再开第二个端口时，Chrome 会把
// 参数交给已有实例，新端口不会监听，AC_CDP_PORT 看似生效实则连回旧端口。
const logFile = (port) => path.join(TMP, `chrome${port}.probe.log`);
const userDataDir = (port) => path.join(TMP, `chrome${port}`);

const BROWSER_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
];

function usage() {
  console.log('usage: node scripts/probe-cdp.mjs [--port <n>] [--json] [--self-test] [--no-launch]');
  console.log('       port defaults to $AC_CDP_PORT, then 9223');
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function readVersion(port, timeoutMs = 1500) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json/version`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status} from /json/version` };
    const body = await res.json();
    const browser = typeof body.Browser === 'string' && body.Browser
      ? body.Browser
      : typeof body['User-Agent'] === 'string' && body['User-Agent']
        ? body['User-Agent']
        : 'unknown';
    return { ok: true, browser };
  } catch (err) {
    const message = err instanceof Error
      ? (err.cause && err.cause.message ? `${err.message}: ${err.cause.message}` : err.message)
      : String(err);
    return { ok: false, error: message };
  }
}

function findBrowser() {
  for (const candidate of BROWSER_CANDIDATES) {
    try {
      if (fs.statSync(candidate).isFile()) return candidate;
    } catch {
      // not installed
    }
  }
  return null;
}

function launchBrowser(browser, port, attempt) {
  fs.mkdirSync(TMP, { recursive: true });
  fs.mkdirSync(userDataDir(port), { recursive: true });
  const fd = fs.openSync(logFile(port), 'a');
  fs.writeSync(fd, `\n[probe-cdp] ${new Date().toISOString()} attempt ${attempt}: ${browser} --remote-debugging-port=${port}\n`);
  const args = [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir(port)}`,
    '--no-first-run',
    '--disable-crash-reporter',
    '--disable-breakpad',
    '--no-default-browser-check',
    'about:blank',
  ];
  return new Promise((resolve) => {
    let settled = false;
    const child = spawn(browser, args, {
      detached: true,
      stdio: ['ignore', fd, fd],
      windowsHide: true,
    });
    const finish = (value) => {
      if (settled) return;
      settled = true;
      try { fs.closeSync(fd); } catch { /* fd may already be closed */ }
      resolve(value);
    };
    child.once('error', (err) => finish({ ok: false, error: err.message }));
    child.once('spawn', () => {
      child.unref();
      finish({ ok: true, pid: child.pid });
    });
  });
}

/** 结束探针自己拉起的进程树；探活失败时不能把 Chrome 留在后台占着端口。 */
function killTree(pid) {
  try {
    spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
  } catch {
    // 进程可能已自行退出
  }
}

function readLogTail(port, lines = 40) {
  try {
    const content = fs.readFileSync(logFile(port), 'utf8');
    return content.split(/\r?\n/).slice(-lines).join('\n');
  } catch {
    return '';
  }
}

function crashHint(logTail, port) {
  if (/openprocess/i.test(logTail) || /crashpad/i.test(logTail)) {
    return 'Chrome 启动日志里有 crashpad/OpenProcess 访问拒绝，是本机已知沙箱现象；'
      + `关闭已有的 Chrome 实例，或换一个空闲的 CDP 端口（当前 ${port}）。`;
  }
  if (/access is denied|拒绝访问/i.test(logTail)) {
    return '浏览器启动被拒绝访问；可能已有同 user-data-dir 的实例占用，或进程创建被沙箱拦截。';
  }
  return `确认 127.0.0.1:${port} 未被其它程序占用，并检查浏览器是否安装、能否在本机启动。`;
}

/**
 * Resolve the CDP endpoint, launching headless Chrome/Edge when it is not running.
 * Never throws: every failure comes back as { ok: false, ... }.
 */
async function probe(port, { launch = true } = {}) {
  const direct = await readVersion(port);
  if (direct.ok) return { ok: true, port, browser: direct.browser, error: null, hint: null, launched: false };

  if (!launch) {
    return {
      ok: false,
      port,
      browser: null,
      error: direct.error || `no CDP endpoint on 127.0.0.1:${port}`,
      hint: 'CDP 未就绪，且本次调用禁止启动浏览器。',
    };
  }

  const browserPath = findBrowser();
  if (!browserPath) {
    return {
      ok: false,
      port,
      browser: null,
      error: `no CDP endpoint on 127.0.0.1:${port} and no Chrome/Edge executable found`,
      hint: `已查找：${BROWSER_CANDIDATES.join(' ; ')}`,
    };
  }

  const deadline = Date.now() + WAIT_MS;
  let lastError = direct.error || `no CDP endpoint on 127.0.0.1:${port}`;
  const launchedPids = [];
  for (let attempt = 1; attempt <= MAX_LAUNCHES && Date.now() < deadline; attempt += 1) {
    const spawned = await launchBrowser(browserPath, port, attempt);
    if (!spawned.ok) {
      lastError = `failed to launch ${browserPath}: ${spawned.error}`;
    } else {
      launchedPids.push(spawned.pid);
      while (Date.now() < deadline) {
        await sleep(500);
        const polled = await readVersion(port);
        if (polled.ok) {
          return { ok: true, port, browser: polled.browser, error: null, hint: null, launched: true };
        }
        lastError = `CDP did not answer on 127.0.0.1:${port} within ${WAIT_MS} ms after launching ${browserPath}`;
      }
    }
  }

  // 探活失败：清掉本次拉起的 Chrome，避免残留进程占住端口。
  for (const pid of launchedPids) killTree(pid);

  const logTail = readLogTail(port, 40);
  return {
    ok: false,
    port,
    browser: null,
    error: lastError,
    hint: crashHint(logTail, port),
    logFile: logFile(port),
    logTail,
  };
}

function emit(result, asJson) {
  if (asJson) {
    console.log(JSON.stringify({
      ok: result.ok,
      port: result.port,
      browser: result.ok ? result.browser : null,
      error: result.ok ? null : result.error,
      hint: result.ok ? null : result.hint,
    }));
    return;
  }
  if (result.ok) {
    console.log(`CDP_OK ${result.browser} ${result.port}`);
    return;
  }
  console.error(`CDP_FAIL port=${result.port} error=${result.error}`);
  console.error(`hint: ${result.hint}`);
  if (result.logTail) {
    const last = result.logTail.split(/\r?\n/).filter(Boolean).slice(-5).join('\n');
    if (last) console.error(`log tail (${result.logFile}):\n${last}`);
  }
}

async function selfTest() {
  const fakePort = 65530;
  const problems = [];

  // In-process check of the failure payload (no browser launch, no child process).
  const direct = await probe(fakePort, { launch: false });
  if (direct.ok) problems.push(`fake port ${fakePort} unexpectedly answered`);
  if (!direct.error) problems.push('failure result has no error text');
  if ((direct.ok ? 0 : 3) !== 3) problems.push('failure path did not map to exit code 3');

  // End-to-end exit-code check. stdio is inherited because this sandbox denies piped
  // stdio for child processes (EPERM), so the child's JSON is printed to this process's stdout.
  const args = [fileURLToPath(import.meta.url), '--port', String(fakePort), '--json', '--no-launch'];
  const run = spawnSync(process.execPath, args, { stdio: 'inherit', timeout: 30000 });
  if (run.error) problems.push(`spawn failed: ${run.error.message}`);
  if (run.status !== 3) problems.push(`expected exit 3, got ${run.status}`);

  if (problems.length) {
    console.error(`SELF_TEST_FAIL ${problems.join(' | ')}`);
    process.exit(1);
  }
  console.log(`SELF_TEST_OK fake port ${fakePort} -> exit 3, ok=false, error=${JSON.stringify(direct.error)}`);
}

async function main() {
  const argv = process.argv.slice(2);
  let asJson = false;
  let selfTestMode = false;
  let launch = true;
  // 端口优先级：--port > $AC_CDP_PORT > 9223。AC_CDP_PORT 是断言脚本公共层的契约，
  // 这里必须真正接收，否则脚本连 9250、探针探 9223，表现为 fetch failed 或静默 skip。
  const envPort = process.env.AC_CDP_PORT;
  let port = envPort !== undefined && envPort !== '' ? Number(envPort) : DEFAULT_PORT;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') asJson = true;
    else if (arg === '--self-test') selfTestMode = true;
    else if (arg === '--no-launch') launch = false;
    else if (arg === '--port' && i + 1 < argv.length) {
      i += 1;
      port = Number(argv[i]);
    } else if (arg.startsWith('--port=')) {
      port = Number(arg.slice('--port='.length));
    } else if (arg === '-h' || arg === '--help') {
      usage();
      process.exit(0);
    } else {
      console.error(`unknown argument: ${arg}`);
      usage();
      process.exit(2);
    }
  }

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error(`invalid port: ${port}`);
    process.exit(2);
  }

  if (selfTestMode) {
    await selfTest();
    process.exit(0);
  }

  const result = await probe(port, { launch });
  emit(result, asJson);
  process.exit(result.ok ? 0 : 3);
}

// 本脚本覆盖的 v2 规则位（GATES.md 表 2-1 指派），供 check-rule-fields.mjs 双向核对。
const RULES = ['MXV2-8-04'];

// 既有脚本的 --rule 是整册口径：参数被接受并校验归属，检查仍跑全套（覆盖面大于单条）。
const __ruleIndex = process.argv.indexOf('--rule');
if (__ruleIndex >= 0) {
  const __ruleId = process.argv[__ruleIndex + 1];
  if (!__ruleId || !RULES.includes(__ruleId)) {
    console.error(`probe-cdp.mjs: 不覆盖规则 ${__ruleId ?? ''}；覆盖 ${RULES.join(', ')}`);
    process.exit(2);
  }
  process.argv.splice(__ruleIndex, 2);
}

main().catch((err) => {
  console.error(`CDP_FAIL port=${DEFAULT_PORT} unexpected error: ${err instanceof Error ? err.stack : String(err)}`);
  process.exit(3);
});
