// WebSocket 客户端（零第三方依赖，用 Node 24 内置的全局 WebSocket）。
// 契约 docs/m1-contract.md §3.2：所有帧为 JSON，统一信封 { type, data }。
//
// 只做三件事：连接、收发 JSON 帧、收集帧序列（供 grader 断言顺序）。
// 不实现重连/退避——评测要的是"一次确定的连接"，重连是产品的职责。

/**
 * 把 http(s)://host 派生成 ws(s)://host，便于复用同一个 BASE_URL。
 * @param {string} baseURL 形如 http://127.0.0.1:8787
 */
export function wsBaseURL(baseURL) {
  return String(baseURL).replace(/^http/i, 'ws');
}

/**
 * 建立一条 WebSocket 连接。
 * @param {string} url 完整 ws(s) URL（含 query）
 * @param {{
 *   onFrame?:(f:{type:string,data:any,raw:string,at:number})=>void,
 *   onError?:(e:Error)=>void,
 *   onClose?:(c:{code:number,reason:string})=>void,
 *   connectTimeoutMs?:number
 * }} opts
 * @returns {{send:(frame:any)=>void, close:()=>void, done:Promise<void>, opened:Promise<void>}}
 */
export function connectWS(url, opts = {}) {
  const WebSocketImpl = globalThis.WebSocket;
  if (typeof WebSocketImpl !== 'function') {
    throw new Error('当前 Node 没有内置 WebSocket（需 Node 22+，契约要求 Node 24）');
  }

  const ws = new WebSocketImpl(url);
  const frames = [];
  let closedByUs = false;
  let settleDone;
  const done = new Promise((r) => (settleDone = r));

  let settleOpened;
  let rejectOpened;
  const opened = new Promise((resolve, reject) => {
    settleOpened = resolve;
    rejectOpened = reject;
  });

  const connectTimeout = setTimeout(() => {
    rejectOpened(new Error(`WebSocket 连接超时（>${opts.connectTimeoutMs ?? 5000}ms）：${url}`));
    try {
      ws.close();
    } catch {
      /* ignore */
    }
  }, opts.connectTimeoutMs ?? 5_000);

  ws.addEventListener('open', () => {
    clearTimeout(connectTimeout);
    settleOpened();
  });

  ws.addEventListener('message', (ev) => {
    const raw = typeof ev.data === 'string' ? ev.data : Buffer.from(ev.data).toString('utf8');
    let type = '';
    let data = null;
    try {
      const parsed = JSON.parse(raw);
      // 契约信封：{type, data}
      type = typeof parsed?.type === 'string' ? parsed.type : '';
      data = parsed?.data ?? null;
    } catch {
      type = ''; // 非 JSON 帧：保留 raw，交给断言去发现
    }
    const frame = { type, data, raw, at: Date.now() };
    frames.push(frame);
    opts.onFrame?.(frame);
  });

  ws.addEventListener('error', () => {
    // 浏览器的 error 事件不带细节；close 事件会带 code，统一在 onError 里给可读信息
    opts.onError?.(new Error(`WebSocket 错误（${url}）；若服务未实现 /api/ws，握手会被拒`));
  });

  ws.addEventListener('close', (ev) => {
    clearTimeout(connectTimeout);
    if (!closedByUs) opts.onClose?.({ code: ev.code, reason: ev.reason || '' });
    settleDone();
  });

  // 连接失败的兜底：close 可能先于 open 到来
  opened.catch(() => settleDone());

  return {
    opened,
    done,
    frames,
    /**
     * 发一帧。契约要求 `{type, data}` 信封；也接受完整对象（自带 type/data）。
     */
    send(frame) {
      const payload = frame && typeof frame.type === 'string' && 'data' in frame ? frame : { type: frame?.type, data: frame?.data ?? {} };
      ws.send(JSON.stringify(payload));
    },
    close() {
      closedByUs = true;
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    },
  };
}
