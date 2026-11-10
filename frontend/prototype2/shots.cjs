const fs = require('node:fs');
const path = require('node:path');
const PORT = '9223';
const BASE = 'file:///E:/dsh_home/workspaces/agent/frontend/prototype2/index.html';
const OUT = 'E:/dsh_home/workspaces/agent/frontend/prototype2/shots';
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function capture(state, w, h) {
  const url = `${BASE}?state=${state}&t=${Date.now()}`;
  const created = await (await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' })).json();
  const ws = new WebSocket(created.webSocketDebuggerUrl);
  let id = 0; const pending = new Map();
  ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  const cmd = (method, params = {}) => new Promise((resolve, reject) => { const i = ++id; pending.set(i, m => m.error ? reject(new Error(m.error.message)) : resolve(m.result)); ws.send(JSON.stringify({ id: i, method, params })); });
  await cmd('Page.enable');
  await cmd('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  await sleep(1400);
  const s = await cmd('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(OUT, `${state}-${w}.png`), Buffer.from(s.data, 'base64'));
  ws.close();
  console.log('shot', state, w);
}

(async () => {
  await capture('normal', 1600, 1000);
  await capture('normal', 1180, 900);
  await capture('empty', 1600, 1000);
  await capture('loading', 1600, 1000);
  await capture('error', 1600, 1000);
  await capture('long', 1600, 1000);
  await capture('overview', 1600, 1000);
  await capture('settings', 1600, 1000);
  await capture('permission', 1180, 900);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
