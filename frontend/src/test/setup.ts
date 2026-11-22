import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import { invalidateSessionListCache, invalidateSpecProjectionCache } from '../api'

afterEach(() => cleanup())

// 会话列表与投影的 ETag 缓存都是模块级的：每个用例开始都清一次，
// 避免上一个用例的标签让新快照的请求命中 304。
beforeEach(() => { invalidateSessionListCache(); invalidateSpecProjectionCache() })

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

class BroadcastChannelStub {
  name: string
  onmessage: ((event: MessageEvent) => void) | null = null
  constructor(name: string) { this.name = name }
  postMessage(): void {}
  close(): void {}
  addEventListener(): void {}
  removeEventListener(): void {}
}

// Keep unit/integration tests off the real network by default. MSW intercepts
// native WebSocket connections, so a controlled stub prevents unmatched
// `/api/ws` warnings (and exit code 1) from any test that renders the app.
class WebSocketStub {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3
  static instances: WebSocketStub[] = []
  readyState = WebSocketStub.CONNECTING
  sent: string[] = []
  private listeners = new Map<string, Set<(event: unknown) => void>>()

  constructor(public url: string) {
    WebSocketStub.instances.push(this)
    queueMicrotask(() => {
      if (this.readyState !== WebSocketStub.CONNECTING) return
      this.readyState = WebSocketStub.OPEN
      this.dispatch('open', {})
    })
  }

  addEventListener(type: string, listener: (event: unknown) => void): void {
    const listeners = this.listeners.get(type) ?? new Set()
    listeners.add(listener)
    this.listeners.set(type, listeners)
  }

  removeEventListener(type: string, listener: (event: unknown) => void): void {
    this.listeners.get(type)?.delete(listener)
  }

  send(data: string): void {
    this.sent.push(data)
  }

  close(): void {
    this.readyState = WebSocketStub.CLOSED
    this.dispatch('close', {})
  }

  private dispatch(type: string, event: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event)
  }
}

Object.defineProperty(globalThis, 'ResizeObserver', { configurable: true, writable: true, value: ResizeObserverStub })
Object.defineProperty(globalThis, 'BroadcastChannel', { configurable: true, writable: true, value: BroadcastChannelStub })
Object.defineProperty(globalThis, 'WebSocket', { configurable: true, writable: true, value: WebSocketStub })
afterEach(() => {
  for (const socket of WebSocketStub.instances) socket.close()
  WebSocketStub.instances = []
})

Object.defineProperty(window, 'matchMedia', {
  configurable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
})

Object.defineProperty(navigator, 'clipboard', {
  configurable: true,
  writable: true,
  value: { writeText: vi.fn().mockResolvedValue(undefined) },
})

Object.defineProperty(document, 'execCommand', { configurable: true, value: vi.fn().mockReturnValue(true) })

Object.defineProperty(window, 'requestAnimationFrame', {
  configurable: true,
  writable: true,
  value: (callback: FrameRequestCallback) => window.setTimeout(() => callback(performance.now()), 0),
})
Object.defineProperty(window, 'cancelAnimationFrame', {
  configurable: true,
  writable: true,
  value: (id: number) => window.clearTimeout(id),
})

HTMLElement.prototype.scrollTo = vi.fn()

