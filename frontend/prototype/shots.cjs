const fs = require('node:fs');
const path = require('node:path');
const PORT = '9223';
const BASE = 'file:///E:/dsh_home/workspaces/agent/frontend/prototype/index.html';
const OUT = 'E:/dsh_home/workspaces/agent/frontend/prototype/shots';
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const page = list.find(t => t.type === 'page') || list[0];
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const pending = new Map();
  ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  const cmd = (method, params = {}) => new Promise((resolve, reject) => { const i = ++id; pending.set(i, m => m.error ? reject(new Error(m.error.message)) : resolve(m.result)); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expression) => (await cmd('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.value;
  const shot = async (name, w = 1600, h = 1000) => {
    await cmd('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
    await sleep(600);
    const s = await cmd('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(s.data, 'base64'));
    console.log('shot', name);
  };
  await cmd('Page.enable');
  const go = async (state) => {
    await cmd('Page.navigate', { url: 'about:blank' });
    await sleep(300);
    await cmd('Page.navigate', { url: BASE + '?state=' + state + '&t=' + Date.now() });
    await sleep(1000);
    const actual = await ev("document.body.dataset.state");
    if (actual !== state) {
      await cmd('Page.reload');
      await sleep(1000);
    }
    await ev("document.getElementById('overlay').hidden = true; document.getElementById('popover-permission').hidden = true; 'ok'");
    if (state === 'settings') await ev("document.getElementById('overlay').hidden = false; 'ok'");
    if (state === 'permission') await ev("document.getElementById('popover-permission').hidden = false; 'ok'");
    await sleep(300);
  };

  await go('normal'); await shot('p-normal-1600', 1600, 1000);
  await shot('p-normal-1060', 1060, 766);
  await go('empty'); await shot('p-empty-1600', 1600, 1000);
  await go('loading'); await shot('p-loading-1600', 1600, 1000);
  await go('error'); await shot('p-error-1600', 1600, 1000);
  await go('long'); await shot('p-long-1600', 1600, 1000);
  await go('settings'); await shot('p-settings-1600', 1600, 1000);
  await go('permission'); await shot('p-permission-1060', 1060, 766);
  ws.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
