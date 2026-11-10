const fs = require('node:fs');
const PORT = '9223';
const BASE = 'file:///E:/dsh_home/workspaces/agent/frontend/prototype4/index.html';
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const url = BASE + '?state=long&t=' + Date.now();
  const created = await (await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' })).json();
  const ws = new WebSocket(created.webSocketDebuggerUrl);
  let id = 0; const pending = new Map();
  ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  const cmd = (method, params = {}) => new Promise((resolve, reject) => { const i = ++id; pending.set(i, m => m.error ? reject(new Error(m.error.message)) : resolve(m.result)); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async s => (await cmd('Runtime.evaluate', { expression: s, returnByValue: true })).result.value;
  await cmd('Page.enable');
  await cmd('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
  await sleep(1400);
  const rects = JSON.parse(await ev(`JSON.stringify([...document.querySelectorAll('.s-msg')].map(m=>{const r=m.getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width)}}).filter(r=>r.y>80&&r.y<820).slice(0,3))`));
  console.log(JSON.stringify(rects));
  let idx = 0;
  for (const r of rects) {
    const clip = { x: r.x, y: r.y, width: Math.min(500, r.w), height: 44, scale: 3 };
    const s = await cmd('Page.captureScreenshot', { format: 'png', clip });
    fs.writeFileSync(`E:/dsh_home/workspaces/agent/frontend/prototype4/shots/hdr-${idx++}.png`, Buffer.from(s.data, 'base64'));
  }
  console.log('done');
  ws.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
