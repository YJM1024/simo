// 极简 HTTP 客户端（零第三方依赖）。
// 只依赖 node:http / node:url，满足 E0「确定性、可离线、无依赖」的要求。
import http from 'node:http';
import { URL } from 'node:url';

/**
 * 发一个 HTTP 请求并读完响应体。
 * @param {string} baseURL 形如 http://127.0.0.1:8787
 * @param {{method?:string,path:string,body?:any,headers?:object,timeoutMs?:number}} opts
 * @returns {Promise<{status:number,headers:object,body:string,json:any,ms:number}>}
 */
export function request(baseURL, opts) {
  const method = (opts.method || 'GET').toUpperCase();
  const url = new URL(opts.path, baseURL);

  // 三种请求体：multipart（M8 上传）/ 原始 Buffer / JSON 或字符串
  let payload = null;
  let forcedContentType = null;
  if (opts.multipart) {
    const mp = buildMultipart(opts.multipart);
    payload = mp.body;
    forcedContentType = mp.contentType;
  } else if (Buffer.isBuffer(opts.body)) {
    payload = opts.body;
  } else {
    payload =
      opts.body === undefined || opts.body === null
        ? null
        : typeof opts.body === 'string'
          ? opts.body
          : JSON.stringify(opts.body);
  }

  const headers = { accept: 'application/json', ...(opts.headers || {}) };
  if (opts.accept) headers.accept = opts.accept;
  if (payload !== null) {
    headers['content-type'] =
      headers['content-type'] || forcedContentType || 'application/json; charset=utf-8';
    headers['content-length'] = Buffer.byteLength(payload);
  }

  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method,
        headers,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks);
          const body = raw.toString('utf8');
          let json = null;
          try {
            json = JSON.parse(body);
          } catch {
            /* 非 JSON 响应保持 null，由 grader 判定 */
          }
          resolve({
            status: res.statusCode || 0,
            headers: res.headers,
            body,
            raw, // 原文 Buffer：M8 下载内容逐字节比对用
            json,
            ms: Date.now() - startedAt,
          });
        });
        res.on('error', reject);
      },
    );

    req.setTimeout(opts.timeoutMs ?? 10_000, () => {
      req.destroy(new Error(`请求超时（>${opts.timeoutMs ?? 10_000}ms）：${method} ${opts.path}`));
    });
    req.on('error', reject);
    if (payload !== null) req.write(payload);
    req.end();
  });
}

/**
 * 构造 multipart/form-data 请求体（M8 上传用）。
 * @param {{fields?:Record<string,string>, files?:Array<{field?:string,filename:string,mime?:string,data:Buffer|string}>}} spec
 * @returns {{body:Buffer, contentType:string}}
 */
export function buildMultipart(spec = {}) {
  const boundary = `----evals${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const parts = [];
  const push = (s) => parts.push(Buffer.isBuffer(s) ? s : Buffer.from(String(s), 'utf8'));

  for (const [name, value] of Object.entries(spec.fields || {})) {
    push(`--${boundary}\r\n`);
    push(`Content-Disposition: form-data; name="${name}"\r\n\r\n`);
    push(`${value}\r\n`);
  }
  for (const f of spec.files || []) {
    const field = f.field || 'file';
    push(`--${boundary}\r\n`);
    push(`Content-Disposition: form-data; name="${field}"; filename="${f.filename}"\r\n`);
    push(`Content-Type: ${f.mime || 'application/octet-stream'}\r\n\r\n`);
    push(Buffer.isBuffer(f.data) ? f.data : Buffer.from(String(f.data), 'utf8'));
    push('\r\n');
  }
  push(`--${boundary}--\r\n`);

  return {
    body: Buffer.concat(parts),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

/**
 * 打开一个 SSE 连接，按事件回调；返回 { close, done }。
 * 解析 `event:` + `data:` 两行式（契约 §3），并把 `: ping` 注释行忽略。
 * @param {string} baseURL
 * @param {{path:string, onEvent:(ev:{event:string,data:string,json:any,at:number})=>void, onError?:(e:Error)=>void}} opts
 */
export function openSSE(baseURL, opts) {
  const url = new URL(opts.path, baseURL);
  let closedByUs = false;
  let finished;
  const done = new Promise((resolve) => {
    finished = resolve;
  });

  const req = http.request(
    {
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: 'GET',
      headers: { accept: 'text/event-stream', 'cache-control': 'no-cache' },
    },
    (res) => {
      if (res.statusCode !== 200) {
        opts.onError?.(new Error(`SSE 连接失败：HTTP ${res.statusCode}`));
        res.resume();
        finished();
        return;
      }
      res.setEncoding('utf8');
      let buf = '';
      let curEvent = null;
      let curData = [];

      const flush = () => {
        if (curEvent === null && curData.length === 0) return;
        const data = curData.join('\n');
        let json = null;
        try {
          json = JSON.parse(data);
        } catch {
          /* 非 JSON data 保持 null */
        }
        const ev = { event: curEvent || 'message', data, json, at: Date.now() };
        curEvent = null;
        curData = [];
        opts.onEvent(ev);
      };

      res.on('data', (chunk) => {
        buf += chunk;
        let idx;
        // 以空行分隔事件；兼容 \r\n
        while ((idx = buf.indexOf('\n\n')) !== -1) {
          const raw = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          for (const line of raw.split('\n')) {
            const l = line.replace(/\r$/, '');
            if (!l || l.startsWith(':')) continue; // 注释/心跳
            if (l.startsWith('event:')) curEvent = l.slice(6).trim();
            else if (l.startsWith('data:')) curData.push(l.slice(5).trimStart());
          }
          flush();
        }
      });
      res.on('end', () => {
        flush();
        finished();
      });
      res.on('error', (e) => {
        opts.onError?.(e);
        finished();
      });
    },
  );

  req.on('error', (e) => {
    if (!closedByUs) opts.onError?.(e);
    finished();
  });
  req.end();

  return {
    done,
    close() {
      closedByUs = true;
      req.destroy();
    },
  };
}
