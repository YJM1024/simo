// platform/router.ts —— 极小「路由」：当前会话写进 URL（?session=<id>）
//
// 不用路由库（技术栈：无路由）。会话 id 放进 URL 有两个实际好处：
//   1) 刷新后中栏立刻知道要拉哪个会话（M1 单会话；M2 多会话直接可用）；
//   2) 左栏与中栏通过 URL + 事件解耦，不需要互相 import。

const PARAM = 'session'

export function readSessionId(): string | null {
  try {
    const value = new URLSearchParams(window.location.search).get(PARAM)
    const trimmed = value?.trim()
    return trimmed ? trimmed : null
  } catch {
    return null
  }
}

export function writeSessionId(sessionId: string | null): void {
  try {
    const url = new URL(window.location.href)
    if (sessionId) url.searchParams.set(PARAM, sessionId)
    else url.searchParams.delete(PARAM)
    if (url.href !== window.location.href) window.history.replaceState({}, '', url)
  } catch {
    // URL 不可写时静默失败：M1 单会话不影响功能
  }
}

/** 浏览器前进/后退（M2 深链接用；M1 基本不触发）。 */
export function onUrlChange(handler: () => void): () => void {
  window.addEventListener('popstate', handler)
  return () => window.removeEventListener('popstate', handler)
}
