import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { archiveSession, connectEvents, getSpecProjection, invalidateSessionListCache, invalidateSpecProjectionCache, listSessions, pinSession, renameSession, sendChat } from './api'
import type { SessionSpecProjection } from './types'

interface StubSocket {
  close: () => void
  readyState: number
}

describe('connectEvents', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('enters the closed terminal state after the retry budget is exhausted', async () => {
    const statuses: string[] = []
    const events = connectEvents('main', { onDelta: () => {}, onStatus: (status) => statuses.push(status) })
    const sockets = (globalThis.WebSocket as unknown as { instances: StubSocket[] }).instances

    await vi.advanceTimersByTimeAsync(0)
    expect(statuses).toEqual(['open'])

    // 首次连接 + 5 次重连各失败一次，共 6 次 close；第 6 次进入 closed。
    for (let i = 0; i < 6; i += 1) {
      sockets[sockets.length - 1].close()
      await vi.advanceTimersByTimeAsync(6000)
    }



    expect(statuses.filter((status) => status === 'closed')).toHaveLength(1)
    expect(statuses.at(-1)).toBe('closed')
    expect(sockets).toHaveLength(6)

    await vi.advanceTimersByTimeAsync(60_000)
    expect(sockets).toHaveLength(6)
    events.close()
  })

  it('does not report closed when the caller closes the connection intentionally', async () => {
    const statuses: string[] = []
    const events = connectEvents('main', { onDelta: () => {}, onStatus: (status) => statuses.push(status) })

    await vi.advanceTimersByTimeAsync(0)
    events.close()

    expect(statuses).not.toContain('closed')
    expect(statuses).not.toContain('reconnecting')
  })

  it('forwards session_unread frames with the payload sessionId', async () => {
    const events: Array<{ type: string; id: string }> = []
    const connection = connectEvents('main', {
      onDelta: () => {},
      onStatus: () => {},
      onEvent: (event) => events.push({ type: event.type, id: event.id }),
    })
    await vi.advanceTimersByTimeAsync(0)
    const sockets = (globalThis.WebSocket as unknown as { instances: Array<{ dispatch: (type: string, event: unknown) => void }> }).instances
    sockets.at(-1)?.dispatch('message', { data: JSON.stringify({ type: 'session_unread', data: { sessionId: 'child' } }) })
    sockets.at(-1)?.dispatch('message', { data: JSON.stringify({ type: 'session_read', data: { sessionId: 'grand' } }) })

    expect(events).toEqual([
      { type: 'session_unread', id: 'child' },
      { type: 'session_read', id: 'grand' },
    ])
    connection.close()
  })

  it('subscribes with the numeric event cursor and drops message ids', async () => {
    const connection = connectEvents('main', { onDelta: () => {}, onStatus: () => {}, since: () => 42 })
    await vi.advanceTimersByTimeAsync(0)
    const sockets = (globalThis.WebSocket as unknown as { instances: Array<{ sent: string[] }> }).instances
    const frame = JSON.parse(sockets.at(-1)?.sent[0] ?? '{}') as { type: string; data: { sessionId: string; since?: unknown } }
    expect(frame.type).toBe('subscribe')
    expect(frame.data.sessionId).toBe('main')
    expect(frame.data.since).toBe(42)
    connection.close()
  })

  it('omits since when no numeric cursor has been observed yet', async () => {
    const connection = connectEvents('main', { onDelta: () => {}, onStatus: () => {}, since: () => null })
    await vi.advanceTimersByTimeAsync(0)
    const sockets = (globalThis.WebSocket as unknown as { instances: Array<{ sent: string[] }> }).instances
    const frame = JSON.parse(sockets.at(-1)?.sent[0] ?? '{}') as { data: Record<string, unknown> }
    expect(frame.data).not.toHaveProperty('since')
    connection.close()
  })

  it('reports the envelope event id as cursor and keeps the payload message id for events', async () => {
    const cursors: number[] = []
    const events: Array<{ type: string; id: string; eventId?: number }> = []
    const connection = connectEvents('main', {
      onDelta: () => {},
      onStatus: () => {},
      onCursor: (eventId) => cursors.push(eventId),
      onEvent: (event) => events.push({ type: event.type, id: event.id, eventId: event.eventId }),
    })
    await vi.advanceTimersByTimeAsync(0)
    const sockets = (globalThis.WebSocket as unknown as { instances: Array<{ dispatch: (type: string, event: unknown) => void }> }).instances
    sockets.at(-1)?.dispatch('message', { data: JSON.stringify({ type: 'message.created', id: 17, data: { id: 'msg-abc' } }) })
    sockets.at(-1)?.dispatch('message', { data: JSON.stringify({ type: 'reply.done', data: { id: 'msg-def', seq: 2 } }) })
    expect(cursors).toEqual([17])
    expect(events).toEqual([
      { type: 'message.created', id: 'msg-abc', eventId: 17 },
      { type: 'reply.done', id: 'msg-def', eventId: undefined },
    ])
    connection.close()
  })

  it('surfaces subscription errors instead of silently staying open', async () => {
    const errors: string[] = []
    const statuses: string[] = []
    const connection = connectEvents('main', { onDelta: () => {}, onStatus: (status) => statuses.push(status), onError: (message) => errors.push(message) })
    await vi.advanceTimersByTimeAsync(0)
    const sockets = (globalThis.WebSocket as unknown as { instances: Array<{ dispatch: (type: string, event: unknown) => void }> }).instances
    sockets.at(-1)?.dispatch('message', { data: JSON.stringify({ type: 'error', data: { message: 'subscribe.data 非法' } }) })
    expect(errors).toEqual(['subscribe.data 非法'])
    expect(statuses.at(-1)).toBe('error')
    connection.close()
  })
})
function fakeResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  const normalized = new Map(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]))
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => normalized.get(name.toLowerCase()) ?? null },
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  } as unknown as Response
}

const childSessions = [{ id: 'child', parentId: 'main', title: '子会话', createdAt: 1, archived: 0, pinned: false }]

describe('listSessions ETag / 304 (AC-CONV-008-04)', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    invalidateSessionListCache()
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => { vi.unstubAllGlobals() })

  function requestHeaders(callIndex: number): Record<string, string> {
    const init = fetchMock.mock.calls[callIndex]?.[1] as RequestInit | undefined
    return (init?.headers ?? {}) as Record<string, string>
  }

  it('sends If-None-Match on the second title search and keeps the cached array on 304', async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse(200, { sessions: childSessions }, { ETag: '"sess-a1b2"' }))
    const first = await listSessions('子')
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/sessions?q=%E5%AD%90')
    expect(requestHeaders(0)).not.toHaveProperty('If-None-Match')

    fetchMock.mockResolvedValueOnce(fakeResponse(304, null, { ETag: '"sess-a1b2"' }))
    const second = await listSessions(' 子 ')

    expect(requestHeaders(1)['If-None-Match']).toBe('"sess-a1b2"')
    expect(second.notModified).toBe(true)
    // 对象身份断言：304 不产生新的列表数组，调用方写回状态时也不会触发替换
    expect(second.sessions).toBe(first.sessions)
  })

  it('does not send If-None-Match for /tree and handles its plain 200 responses', async () => {
    const tree = [{ ...childSessions[0], children: [] }]
    fetchMock.mockImplementation(async () => fakeResponse(200, { tree, sessions: childSessions }))
    const first = await listSessions()
    const second = await listSessions()

    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual(['/api/sessions/tree', '/api/sessions/tree'])
    expect(requestHeaders(0)).not.toHaveProperty('If-None-Match')
    expect(requestHeaders(1)).not.toHaveProperty('If-None-Match')
    expect(first.tree).toEqual(tree)
    expect(second.tree).toEqual(tree)
    expect(second.notModified).toBeUndefined()
  })

  it('keeps ETags per search term so one term never reuses another term tag', async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse(200, { sessions: childSessions }, { ETag: '"sess-term-a"' }))
    await listSessions('子')
    fetchMock.mockResolvedValueOnce(fakeResponse(200, { sessions: [] }))
    await listSessions('主')

    expect(requestHeaders(1)).not.toHaveProperty('If-None-Match')
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/sessions?q=%E4%B8%BB')
  })

  it.each([
    ['pin', () => pinSession('child')],
    ['archive', () => archiveSession('child')],
    ['rename', () => renameSession('child', '新标题')],
    ['send chat', () => sendChat('child', '你好')],
  ])('drops the cached ETag after %s so the next list request is unconditional', async (_label, mutate) => {
    fetchMock.mockResolvedValueOnce(fakeResponse(200, { sessions: childSessions }, { ETag: '"sess-stale"' }))
    await listSessions('子')
    fetchMock.mockResolvedValueOnce(fakeResponse(200, { ok: true }))
    await mutate()
    fetchMock.mockResolvedValueOnce(fakeResponse(200, { sessions: childSessions }))
    await listSessions('子')

    expect(requestHeaders(2)).not.toHaveProperty('If-None-Match')
    expect(fetchMock.mock.calls[2]?.[0]).toBe('/api/sessions?q=%E5%AD%90')
  })
})

function specProjection(overrides: Partial<SessionSpecProjection> = {}): SessionSpecProjection {
  return {
    sessionId: 'main',
    status: 'running',
    revision: 1,
    updatedAt: 100,
    goal: '目标',
    constraints: [],
    inputs: [],
    tasks: {
      done: { total: 0, items: [], hasMore: false },
      running: { total: 0, items: [], hasMore: false },
      pending: { total: 0, items: [], hasMore: false },
    },
    deliverables: { total: 0, items: [], hasMore: false },
    pendingConfirmations: { total: 0 },
    ...overrides,
  }
}

describe('getSpecProjection ETag / 304', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    invalidateSpecProjectionCache()
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => { vi.unstubAllGlobals() })

  function requestHeaders(callIndex: number): Record<string, string> {
    const init = fetchMock.mock.calls[callIndex]?.[1] as RequestInit | undefined
    return (init?.headers ?? {}) as Record<string, string>
  }

  it('treats 304 as "unchanged" and returns the cached projection without throwing', async () => {
    const etag = '"spec-0011223344556677"'
    fetchMock.mockResolvedValueOnce(fakeResponse(200, specProjection({ revision: 1 }), { ETag: etag }))
    const first = await getSpecProjection('main', 3)
    expect(first.notModified).toBe(false)
    expect(first.projection?.revision).toBe(1)
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/sessions/main/spec-projection?taskLimit=3')
    expect(requestHeaders(0)).not.toHaveProperty('If-None-Match')

    fetchMock.mockResolvedValueOnce(fakeResponse(304, null, { ETag: etag }))
    const second = await getSpecProjection('main', 3)
    expect(requestHeaders(1)['If-None-Match']).toBe(etag)
    expect(second.notModified).toBe(true)
    expect(second.projection?.revision).toBe(1)
  })

  it('keeps separate ETags for taskLimit=3 and taskLimit=50 so neither overwrites the other', async () => {
    const tag3 = '"spec-aaaaaaaaaaaaaaaa"'
    const tag50 = '"spec-bbbbbbbbbbbbbbbb"'
    fetchMock.mockResolvedValueOnce(fakeResponse(200, specProjection({ revision: 3 }), { ETag: tag3 }))
    await getSpecProjection('main', 3)
    fetchMock.mockResolvedValueOnce(fakeResponse(200, specProjection({ revision: 50 }), { ETag: tag50 }))
    await getSpecProjection('main', 50)
    expect(requestHeaders(1)).not.toHaveProperty('If-None-Match')
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/sessions/main/spec-projection?taskLimit=50')

    fetchMock.mockResolvedValueOnce(fakeResponse(304, null, { ETag: tag3 }))
    const three = await getSpecProjection('main', 3)
    expect(requestHeaders(2)['If-None-Match']).toBe(tag3)
    expect(fetchMock.mock.calls[2]?.[0]).toBe('/api/sessions/main/spec-projection?taskLimit=3')
    expect(three.projection?.revision).toBe(3)

    fetchMock.mockResolvedValueOnce(fakeResponse(304, null, { ETag: tag50 }))
    const fifty = await getSpecProjection('main', 50)
    expect(requestHeaders(3)['If-None-Match']).toBe(tag50)
    expect(fifty.projection?.revision).toBe(50)
  })

  it('does not cache one-off activity probes (cache=false), so they cannot evict right-panel tags', async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse(200, specProjection(), { ETag: '"spec-probe"' }))
    await getSpecProjection('main', 1, false)
    fetchMock.mockResolvedValueOnce(fakeResponse(200, specProjection(), { ETag: '"spec-panel"' }))
    await getSpecProjection('main', 1)
    expect(requestHeaders(1)).not.toHaveProperty('If-None-Match')
  })

  it('still surfaces non-304 failures as errors so the right panel can retry', async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse(500, { code: 'INTERNAL' }))
    await expect(getSpecProjection('main', 3)).rejects.toThrow('请求失败（500）')
  })

  it('evicts the least recently used tag once the cache exceeds 8 entries', async () => {
    fetchMock.mockImplementation(async (path: string) => {
      const sessionId = /sessions\/([^/]+)\//.exec(String(path))?.[1] ?? 'unknown'
      return fakeResponse(200, specProjection({ sessionId }), { ETag: `"spec-${sessionId}"` })
    })
    for (let index = 0; index < 9; index += 1) await getSpecProjection(`s${index}`, 3)
    expect(requestHeaders(8)).not.toHaveProperty('If-None-Match')

    await getSpecProjection('s0', 3)
    // s0 是最旧的一条，已被淘汰：再次请求时不带 If-None-Match。
    expect(requestHeaders(9)).not.toHaveProperty('If-None-Match')
    await getSpecProjection('s8', 3)
    expect(requestHeaders(10)['If-None-Match']).toBe('"spec-s8"')
  })
})
