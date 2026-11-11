const fs = require('node:fs');
const PORT = '9223';
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const created = await (await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent('http://127.0.0.1:8897/')}`, { method: 'PUT' })).json();
  const ws = new WebSocket(created.webSocketDebuggerUrl);
  let id = 0; const pending = new Map();
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  const cmd = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, m => m.error ? rej(new Error(m.error.message)) : res(m.result)); ws.send(JSON.stringify({ id: i, method, params })); });
  await cmd('Page.enable');
  const out = 'E:/dsh_home/workspaces/agent/frontend/gallery/shots';
  fs.mkdirSync(out, { recursive: true });
  for (const [w, h, name] of [[1600, 1000, 'gallery-1600'], [1180, 900, 'gallery-1180']]) {
    await cmd('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
    await sleep(1000);
    const s = await cmd('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    fs.writeFileSync(`${out}/${name}.png`, Buffer.from(s.data, 'base64'));
    console.log('shot', name, fs.statSync(`${out}/${name}.png`).size);
  }
  ws.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
