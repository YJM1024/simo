/**
 * 本文件对应决策 D-04：事件总线（Event Bus）。
 *
 * 决策内容：
 *  - 内核内部一切"发生了什么"都以事件对象 {type, payload, seq, ts} 表达；
 *  - 订阅支持按 type 精确订阅、`once`、以及 onAny 通配；
 *  - 同步派发（单线程、按订阅顺序），不引入定时器 / 微任务竞态，保证 demo 确定性。
 *
 * 它保证的不变量：
 *  - 事件对象不可变（Object.freeze），payload 由发布方结构化提供；
 *  - 同一次 emit 内部，订阅顺序固定；订阅在 emit 期间增删不影响本次派发快照；
 *  - 事件序号 seq 单调递增，可用于排序与审计；
 *  - 处理器异常默认向外抛出（开发期快速暴露问题），可用 onHandlerError:'collect' 改为收集。
 */

export const WILDCARD = '*';

export function createBus({ clock = () => Date.now(), onHandlerError = 'throw', historyLimit = 500 } = {}) {
  if (onHandlerError !== 'throw' && onHandlerError !== 'collect') {
    throw new TypeError("D-04: onHandlerError 只能是 'throw' 或 'collect'");
  }

  let seq = 0;
  let subSeq = 0;
  const subs = new Map(); // type -> [sub]
  const anySubs = [];
  const history = [];
  const collectedErrors = [];

  function assertType(type) {
    if (typeof type !== 'string' || type.length === 0) {
      throw new TypeError('D-04: 事件类型必须是非空字符串');
    }
  }

  function subscribe(type, handler, { once = false } = {}) {
    assertType(type);
    if (typeof handler !== 'function') throw new TypeError('D-04: 订阅处理函数必须是函数');
    const sub = { id: ++subSeq, type, handler, once: Boolean(once) };
    if (!subs.has(type)) subs.set(type, []);
    subs.get(type).push(sub);
    return { id: sub.id, off: () => unsubscribe(type, handler) };
  }

  function unsubscribe(type, handler) {
    const list = subs.get(type);
    if (!list) return false;
    const index = list.findIndex((sub) => sub.handler === handler);
    if (index < 0) return false;
    list.splice(index, 1);
    if (list.length === 0) subs.delete(type);
    return true;
  }

  function invoke(handler, event) {
    try {
      handler(event);
    } catch (error) {
      if (onHandlerError === 'throw') throw error;
      collectedErrors.push({ event, error });
    }
  }

  function emit(type, payload = {}) {
    assertType(type);
    const event = Object.freeze({ seq: ++seq, type, payload: payload ?? {}, ts: clock() });
    history.push(event);
    if (history.length > historyLimit) history.shift();

    // 快照：派发期间的订阅变更不影响本次派发。
    const exact = [...(subs.get(type) ?? [])];
    for (const sub of exact) {
      if (sub.once) unsubscribe(type, sub.handler);
      invoke(sub.handler, event);
    }
    for (const sub of [...anySubs]) {
      if (sub.once) removeAny(sub);
      invoke(sub.handler, event);
    }
    return event;
  }

  function removeAny(sub) {
    const index = anySubs.indexOf(sub);
    if (index >= 0) anySubs.splice(index, 1);
  }

  function onAny(handler, { once = false } = {}) {
    if (typeof handler !== 'function') throw new TypeError('D-04: 通配订阅处理函数必须是函数');
    const sub = { id: ++subSeq, type: WILDCARD, handler, once: Boolean(once) };
    anySubs.push(sub);
    return { id: sub.id, off: () => removeAny(sub) };
  }

  return {
    on: (type, handler) => subscribe(type, handler),
    once: (type, handler) => subscribe(type, handler, { once: true }),
    onAny,
    onceAny: (handler) => onAny(handler, { once: true }),
    off: unsubscribe,
    emit,
    /** 已投递事件快照（最多 historyLimit 条），用于审计 / 断言。 */
    history: () => [...history],
    /** onHandlerError:'collect' 时收集到的异常。 */
    errors: () => [...collectedErrors],
    subscriberCount: (type) => (type ? (subs.get(type)?.length ?? 0) : anySubs.length),
  };
}
