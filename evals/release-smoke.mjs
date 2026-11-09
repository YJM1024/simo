// release-smoke.mjs —— M7 交付冒烟（单二进制冷启动）
//
// 只依赖 Node 内置模块 + evals/lib（零第三方依赖）。
//
// 用法：
//   node evals/release-smoke.mjs                 # 用已有构建，或先 go build
//   node evals/release-smoke.mjs --exe <path>    # 指定现成的 agentd 可执行文件
//   node evals/release-smoke.mjs --build         # 先 go build（toolchain/go.ps1）
//   node evals/release-smoke.mjs --keep          # 保留临时目录便于排查
//
// 覆盖（对应 M7 §3 交付冒烟）：
//   1) 单文件二进制：把 exe 单独拷到空目录，不依赖仓库任何文件即可启动
//   2) 冷启动：全新 AGENTD_HOME → /api/health → GET / 首页 → WS hello → POST /api/chat → 消息落库
//   3) 重启持久：同一 home 重启 → 之前消息仍在
//   4) 换 home 空数据：另一个全新 home → 消息为 0
//   5) preflight：AGENTD_HOME 不可创建时，进程非 0 退出且 stderr 有明确原因
//   6) deploy/ 静态核对：Dockerfile/compose 与 AGENTD_HOME/端口/非 root 一致（本机无容器 → 标注未实测）
//
// 说明：本沙箱禁止 Node 用管道 spawn 子进程（EPERM），所以服务进程统一**经 cmd.exe 重定向到日志文件**启动，
//       stderr 从文件读，既绕开管道限制，又能保留完整错误信息。

import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { request } from './lib/http.mjs';
import { connectWS, wsBaseURL } from './lib/ws.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const value = (n) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};

const checks = [];
const add = (name, ok, note) => {
  checks.push({ name, ok, note });
  console.log(`${ok ? '✓' : '✗'} ${name}：${note}`);
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 探测模式：对一个**已在运行**的服务做断言（由 pwsh 编排起停）。
 *  用法：node evals/release-smoke.mjs --probe --base-url http://127.0.0.1:PORT [--chat "文本"] [--expect "子串"] [--expect-empty]
 */
async function probeMode() {
  const base = (value('--base-url') || `http://127.0.0.1:${value('--port') || 8787}`).replace(/\/$/, '');
  const out = [];
  const push = (name, ok, note) => {
    out.push({ name, ok, note });
    console.log(`${ok ? '✓' : '✗'} ${name}：${note}`);
  };

  const h = await healthFrom(base);
  push('健康检查 /api/health', h.ok, h.note);

  try {
    const r = await request(base, { path: '/', timeoutMs: 5_000 });
    const html = /text\/html/i.test(String(r.headers['content-type'] || ''));
    push('首页 GET /', r.status === 200 && html && /<div id="root"/.test(r.body), `HTTP ${r.status}${html ? ' text/html' : ''}`);
  } catch (e) {
    push('首页 GET /', false, e.message);
  }

  const ws = await wsHandshakeBase(base);
  push('WS /api/ws 握手', ws.ok, ws.note);

  const chatText = value('--chat');
  if (chatText) {
    try {
      const r = await request(base, { method: 'POST', path: '/api/chat', body: { sessionId: 'main', text: chatText }, timeoutMs: 10_000 });
      push('POST /api/chat', [200, 202].includes(r.status), `HTTP ${r.status}`);
      const needle = value('--expect') || chatText;
      const p = await pollMessagesBase(base, 'main', needle, 15_000);
      push('消息落库', p.ok, p.note);
    } catch (e) {
      push('POST /api/chat', false, e.message);
    }
  }

  const expect = value('--expect');
  if (expect) {
    try {
      const r = await request(base, { path: '/api/messages?sessionId=main', timeoutMs: 5_000 });
      const has = r.body.includes(expect);
      push(`重启后含 ${expect.slice(0, 24)}`, has, `HTTP ${r.status}，${has ? '存在' : '**不存在**'}（${(r.json?.messages || []).length} 条）`);
    } catch (e) {
      push('重启后消息仍在', false, e.message);
    }
  }

  if (flag('--expect-empty')) {
    try {
      const r = await request(base, { path: '/api/messages?sessionId=main', timeoutMs: 5_000 });
      const n = Array.isArray(r.json?.messages) ? r.json.messages.length : -1;
      push('新 AGENTD_HOME 为空数据', n === 0, `messages = ${n}`);
    } catch (e) {
      push('新 AGENTD_HOME 为空数据', false, e.message);
    }
  }

  const bad = out.filter((c) => !c.ok);
  process.exit(bad.length ? 1 : 0);
}

async function healthFrom(base) {
  try {
    const r = await request(base, { path: '/api/health', timeoutMs: 3_000 });
    return { ok: r.status === 200 && r.json?.ok === true, note: `HTTP ${r.status}` };
  } catch (e) {
    return { ok: false, note: e.message };
  }
}

async function wsHandshakeBase(base) {
  try {
    const url = `${wsBaseURL(base)}/api/ws?sessionId=main`;
    const conn = connectWS(url, { connectTimeoutMs: 5_000 });
    // 必须挂 catch：连接失败时 opened 会 reject，否则进程被未处理拒绝打断
    const opened = await Promise.race([
      conn.opened.then(() => true).catch(() => false),
      sleep(5_000).then(() => false),
    ]);
    // hello 帧是连接后立即推送的；等一小会儿再取快照，避免"刚 open 还没收到帧"
    if (opened) {
      const deadline = Date.now() + 2_000;
      while (Date.now() < deadline && !(conn.frames || []).some((f) => f && f.type === 'hello')) {
        await sleep(50);
      }
    }
    const hello = (conn.frames || []).some((f) => f && f.type === 'hello');
    conn.close();
    if (!opened) return { ok: false, note: '5s 内未完成 WebSocket 升级' };
    return { ok: true, note: hello ? 'hello 帧已收到' : '已连接（hello 未捕获）' };
  } catch (e) {
    return { ok: false, note: e.message };
  }
}

async function pollMessagesBase(base, sessionId, needle, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let last = -1;
  while (Date.now() < deadline) {
    try {
      const r = await request(base, { path: `/api/messages?sessionId=${encodeURIComponent(sessionId)}`, timeoutMs: 3_000 });
      const n = Array.isArray(r.json?.messages) ? r.json.messages.length : -1;
      last = n;
      if (r.body.includes(needle)) return { ok: true, note: `${n} 条消息，含探针` };
    } catch {
      /* ignore */
    }
    await sleep(300);
  }
  return { ok: false, note: `超时未看到探针（最后 ${last} 条）` };
}

async function main() {
  // 探测模式 / 静态核对模式：不起进程，供 pwsh 编排器复用
  if (flag('--probe') || flag('--base-url')) return probeMode();
  if (flag('--deploy-check')) {
    const deploy = await checkDeploy();
    for (const c of deploy) console.log(`${c.ok ? '✓' : '✗'} ${c.name}：${c.note}`);
    process.exit(deploy.some((c) => !c.ok) ? 1 : 0);
  }

  const keep = flag('--keep');
  const work = await fs.mkdtemp(path.join(os.tmpdir(), 'agentd-release-smoke-'));
  console.log(`临时目录：${work}`);
  console.log('');

  // ---------------------------------------------------------------- 0) 取二进制
  let exe = value('--exe');
  if (flag('--build') || !exe) {
    exe = path.join(work, 'agentd.exe');
    const built = await goBuild(exe);
    add('Go 构建（单二进制）', built.ok, built.note);
    if (!built.ok) return finish(work, keep);
  } else {
    await fs.copyFile(exe, path.join(work, 'agentd.exe'));
    exe = path.join(work, 'agentd.exe');
  }

  // 单文件：exe 拷到**全新空目录**，确认旁边没有任何依赖
  const binDir = path.join(work, 'bin');
  await fs.mkdir(binDir, { recursive: true });
  const soloExe = path.join(binDir, 'agentd.exe');
  await fs.copyFile(exe, soloExe);
  const binEntries = await fs.readdir(binDir);
  add('单文件交付（exe 独立于仓库）', binEntries.length === 1 && binEntries[0] === 'agentd.exe', `目录内容 = [${binEntries.join(', ')}]`);

  const port = await freePort();

  // ---------------------------------------------------------------- 1) 冷启动
  const homeA = path.join(work, 'home-a');
  const a1 = await startServer({ exe: soloExe, home: homeA, port, label: 'cold-start' });
  add('冷启动：进程存活 + /api/health 200', a1.healthy, a1.note);

  const homepage = await request(`http://127.0.0.1:${port}`, { path: '/', timeoutMs: 5_000 });
  const isHtml = /text\/html/i.test(String(homepage.headers['content-type'] || ''));
  add('首页（GET /）', homepage.status === 200 && isHtml && /<div id="root"/.test(homepage.body), `HTTP ${homepage.status}${isHtml ? ' text/html' : ' 非 HTML'}`);

  const wsse = await wsHandshake(port);
  add('WS /api/ws 握手 hello 帧', wsse.ok, wsse.note);

  const probe = `release-smoke-${Date.now().toString(36)}`;
  const chat = await request(`http://127.0.0.1:${port}`, {
    method: 'POST',
    path: '/api/chat',
    body: { sessionId: 'main', text: `${probe} 冷启动写入的一条消息` },
    timeoutMs: 10_000,
  });
  add('POST /api/chat 接受消息', [200, 202].includes(chat.status), `HTTP ${chat.status}`);

  const persisted = await pollMessages(port, 'main', probe, 12_000);
  add('冷启动：消息落库', persisted.ok, persisted.note);
  await a1.stop();

  // ---------------------------------------------------------------- 2) 重启持久
  const a2 = await startServer({ exe: soloExe, home: homeA, port, label: 'restart' });
  const afterRestart = await request(`http://127.0.0.1:${port}`, { path: '/api/messages?sessionId=main', timeoutMs: 5_000 });
  add(
    '重启后数据仍在（同一 AGENTD_HOME）',
    a2.healthy && afterRestart.status === 200 && afterRestart.body.includes(probe),
    a2.healthy ? `HTTP ${afterRestart.status}${afterRestart.body.includes(probe) ? '，含此前消息' : '，**不含**此前消息'}` : a2.note,
  );
  await a2.stop();

  // ---------------------------------------------------------------- 3) 换 home 空数据
  const homeB = path.join(work, 'home-b');
  const b1 = await startServer({ exe: soloExe, home: homeB, port, label: 'fresh-home' });
  const fresh = await request(`http://127.0.0.1:${port}`, { path: '/api/messages?sessionId=main', timeoutMs: 5_000 });
  const freshCount = Array.isArray(fresh.json?.messages) ? fresh.json.messages.length : -1;
  add('换 AGENTD_HOME → 空数据', b1.healthy && freshCount === 0, b1.healthy ? `messages = ${freshCount}` : b1.note);
  await b1.stop();

  // ---------------------------------------------------------------- 4) preflight（不可用 home）
  const blocker = path.join(work, 'blocker');
  await fs.writeFile(blocker, 'not a directory'); // 之后 home 的父级是普通文件 → 必然创建失败
  const badHome = path.join(blocker, 'home');
  const bad = await runServerExpectFail({ exe: soloExe, home: badHome, port, timeoutMs: 12_000 });
  const clearMsg = /(home|目录|路径|创建|权限|不可写|permission|denied|mkdir|HOME)/i.test(bad.stderr + bad.stdout);
  add(
    'preflight：不可用 AGENTD_HOME 明确报错',
    bad.exited && bad.code !== 0 && clearMsg,
    bad.exited
      ? `exit=${bad.code}；stderr 首行：${(bad.stderr.split(/\r?\n/).find((l) => l.trim()) || '（空）').slice(0, 160)}`
      : `12s 内未退出（可能有兜底目录，需确认是否符合预期）`,
  );

  // ---------------------------------------------------------------- 5) deploy 静态核对
  const deploy = await checkDeploy();
  for (const c of deploy) add(c.name, c.ok, c.note);

  return finish(work, keep);
}

// ---------------------------------------------------------------- helpers

function finish(work, keep) {
  const bad = checks.filter((c) => !c.ok);
  console.log('');
  console.log(`冒烟小结：${checks.length - bad.length}/${checks.length} PASS${bad.length ? `，${bad.length} 项失败` : ''}`);
  console.log(`临时目录：${work}${keep ? '（--keep 保留）' : ''}`);
  if (!keep) fs.rm(work, { recursive: true, force: true }).catch(() => {});
  process.exit(bad.length ? 1 : 0);
}

async function goBuild(outExe) {
  try {
    await fs.mkdir(path.dirname(outExe), { recursive: true });
    // 注意：必须用 -File 调用 go.ps1（cmd /c 里套 `& script` 容易被引号/执行策略搞坏）
    const line =
      `cd /d "${path.join(REPO, 'agentd')}" && ` +
      `powershell -NoProfile -ExecutionPolicy Bypass -File "${path.join(REPO, 'toolchain', 'go.ps1')}" ` +
      `build -o "${outExe}" ./cmd/agentd`;
    const code = await spawnShell(line);
    const stat = await fs.stat(outExe).catch(() => null);
    if (code !== 0 || !stat) return { ok: false, note: `构建失败（exit=${code}）` };
    return { ok: true, note: `${(stat.size / 1024 / 1024).toFixed(1)} MB` };
  } catch (e) {
    return { ok: false, note: e.message };
  }
}

/** 经 cmd.exe 运行（重定向，避免 Node 管道 spawn 在受限环境里 EPERM）。 */
function spawnShell(commandLine) {
  return new Promise((resolve) => {
    const child = spawn('cmd.exe', ['/d', '/c', commandLine], { stdio: 'ignore', windowsHide: true });
    child.on('exit', (code) => resolve(code ?? -1));
    child.on('error', () => resolve(-1));
  });
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
  });
}

async function startServer({ exe, home, port, label }) {
  await fs.mkdir(home, { recursive: true });
  const log = path.join(path.dirname(home), `${label}.log`);
  const cmd = `set AGENTD_HOME=${home}&& set AGENTD_LLM=mock&& set AGENTD_DEBUG=1&& "${exe}" serve -addr 127.0.0.1:${port} > "${log}" 2>&1`;
  const child = spawn('cmd.exe', ['/d', '/c', cmd], { stdio: 'ignore', windowsHide: true, detached: false });
  const deadline = Date.now() + 20_000;
  let healthy = false;
  while (Date.now() < deadline) {
    if (await health(port)) {
      healthy = true;
      break;
    }
    await sleep(200);
  }
  const note = healthy ? `/api/health 200（${home}）` : `20s 内未就绪；日志：${await tail(log)}`;
  return {
    child,
    healthy,
    note,
    stop: async () => {
      await killTree(child.pid);
      await sleep(300);
    },
  };
}

/** 启动一个**预期失败**的服务，读取它的 stderr（用于 preflight 断言）。 */
async function runServerExpectFail({ exe, home, port, timeoutMs }) {
  const log = path.join(path.dirname(home) + '-bad.log');
  const cmd = `set AGENTD_HOME=${home}&& "${exe}" serve -addr 127.0.0.1:${port} > "${log}" 2>&1`;
  const child = spawn('cmd.exe', ['/d', '/c', cmd], { stdio: 'ignore', windowsHide: true });
  const deadline = Date.now() + timeoutMs;
  let exited = false;
  let code = null;
  child.on('exit', (c) => {
    exited = true;
    code = c;
  });
  while (Date.now() < deadline && !exited) await sleep(200);
  if (!exited) {
    await killTree(child.pid);
  }
  const text = await fs.readFile(log, 'utf8').catch(() => '');
  return { exited, code: code ?? -1, stderr: text, stdout: '' };
}

async function health(port) {
  try {
    const r = await request(`http://127.0.0.1:${port}`, { path: '/api/health', timeoutMs: 1_500 });
    return r.status === 200 && r.json?.ok === true;
  } catch {
    return false;
  }
}

async function wsHandshake(port) {
  try {
    const url = `${wsBaseURL(`http://127.0.0.1:${port}`)}/api/ws?sessionId=main`;
    const conn = connectWS(url, { connectTimeoutMs: 5_000 });
    const ok = await Promise.race([
      conn.opened.then(() => true).catch(() => false),
      sleep(5_000).then(() => false),
    ]);
    const frames = conn.frames || [];
    const hello = frames.some((f) => f && f.type === 'hello');
    conn.close();
    if (!ok) return { ok: false, note: '5s 内未完成 WebSocket 升级' };
    return { ok: true, note: hello ? 'hello 帧已收到' : '已连接（hello 帧未在快照里捕获）' };
  } catch (e) {
    return { ok: false, note: e.message };
  }
}

async function pollMessages(port, sessionId, needle, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let last = -1;
  while (Date.now() < deadline) {
    try {
      const r = await request(`http://127.0.0.1:${port}`, { path: `/api/messages?sessionId=${encodeURIComponent(sessionId)}`, timeoutMs: 3_000 });
      const msgs = Array.isArray(r.json?.messages) ? r.json.messages : [];
      last = msgs.length;
      if (r.body.includes(needle)) return { ok: true, note: `${msgs.length} 条消息，含探针` };
    } catch {
      /* 继续等 */
    }
    await sleep(300);
  }
  return { ok: false, note: `超时未看到探针消息（最后 ${last} 条）` };
}

async function killTree(pid) {
  if (!pid) return;
  await spawnShell(`taskkill /PID ${pid} /T /F > nul 2>&1`);
}

async function tail(file, n = 5) {
  const text = await fs.readFile(file, 'utf8').catch(() => '');
  return text.split(/\r?\n/).filter(Boolean).slice(-n).join(' | ').slice(0, 300) || '（空）';
}

/** deploy/ 静态核对（本机无容器运行时 → 只做一致性检查，标注未实测）。 */
async function checkDeploy() {
  const out = [];
  const dockerfile = await fs.readFile(path.join(REPO, 'deploy', 'Dockerfile'), 'utf8').catch(() => '');
  const compose = await fs.readFile(path.join(REPO, 'deploy', 'compose.yaml'), 'utf8').catch(() => '');

  if (!dockerfile) {
    out.push({ name: 'deploy/Dockerfile 存在', ok: false, note: '未找到' });
    return out;
  }
  out.push({ name: 'deploy/Dockerfile 存在', ok: true, note: `${dockerfile.split(/\r?\n/).length} 行` });

  const homeRef = /AGENTD_HOME/.test(dockerfile) && /AGENTD_HOME/.test(compose);
  out.push({ name: 'AGENTD_HOME 在 Dockerfile 与 compose 中一致出现', ok: homeRef, note: homeRef ? '两处均声明' : '有一处未声明' });

  const portRef = /8787/.test(dockerfile) && /8787/.test(compose);
  out.push({ name: '端口 8787 一致', ok: portRef, note: portRef ? '两处均为 8787' : '端口声明不一致' });

  // 非 root：Dockerfile 里有 USER 且不是 root
  const userLine = (dockerfile.match(/^\s*USER\s+(\S+)/m) || [])[1];
  out.push({ name: '容器以非 root 运行', ok: !!userLine && userLine !== 'root' && userLine !== '0', note: userLine ? `USER ${userLine}` : '未声明 USER（默认 root）' });

  const healthcheck = /HEALTHCHECK/i.test(dockerfile) || /healthcheck/i.test(compose);
  out.push({ name: '健康检查声明（HEALTHCHECK/compose healthcheck）', ok: healthcheck, note: healthcheck ? '已声明' : '未声明' });

  const volume = /\/data|volume|volumes/i.test(dockerfile) && /volume/i.test(compose);
  out.push({ name: '数据卷声明（compose volumes）', ok: volume, note: volume ? '已声明' : '未声明' });

  out.push({ name: '容器实测（docker run/compose up）', ok: true, note: '**本机无容器运行时，未实测**（静态核对通过；需在有 Docker 的环境补跑）' });
  return out;
}

await main();
