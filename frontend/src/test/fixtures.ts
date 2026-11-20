import type { Artifact, Card, Message, Session, SessionSpecProjection, Task } from '../types'
import type { MetricsDashboardData } from '../components'

export function session(overrides: Partial<Session> = {}): Session {
  return { id: 'main', parentId: '', title: '主会话', createdAt: 1_700_000_000_000, archived: 0, pinned: false, ...overrides }
}

export function message(overrides: Partial<Message> = {}): Message {
  return {
    id: 'm1',
    sessionId: 'main',
    sessionTitle: '主会话',
    role: 'agent',
    text: '收到，开始处理。',
    at: 1_700_000_100_000,
    status: 'done',
    category: 'progress',
    ...overrides,
  }
}

export function task(overrides: Partial<Task> = {}): Task {
  return { id: 't1', sessionId: 'main', title: '整理数据', status: 'done', createdAt: 1_700_000_100_000, updatedAt: 1_700_000_100_000, ...overrides }
}

export function artifact(overrides: Partial<Artifact> = {}): Artifact {
  return { id: 'a1', name: 'report.md', mime: 'text/markdown', size: 101, createdAt: 1_700_000_200_000, ...overrides }
}

export function card(overrides: Partial<Card> = {}): Card {
  return {
    id: 'c1',
    sessionId: 'main',
    messageId: 'm1',
    version: 1,
    status: 'active',
    schema: {
      title: '选择数据来源',
      blocks: [
        { id: 'text1', type: 'text', props: { text: '请选择后提交。' } },
        {
          id: 'form1',
          type: 'form',
          props: { fields: [{ kind: 'select', label: '数据来源', name: 'source', options: ['A', 'B'] }, { kind: 'input', label: '说明', name: 'note' }] },
          actions: [{ id: 'submit', label: '确认' }],
        },
      ],
    },
    ...overrides,
  }
}

export function projection(overrides: Partial<SessionSpecProjection> = {}): SessionSpecProjection {
  return {
    sessionId: 'main',
    status: 'active',
    revision: 7,
    updatedAt: 1_700_000_300_000,
    goal: '验证前端测试体系',
    constraints: ['只改 frontend'],
    inputs: ['真实数据'],
    tasks: {
      done: { total: 4, items: [0, 1, 2, 3].map((n) => ({ id: `done-${n}`, title: `完成任务 ${n}`, state: 'done', updatedAt: 1_700_000_100_000 + n, messageId: `msg-${n}` })), hasMore: false },
      running: { total: 1, items: [{ id: 'run-1', title: '进行中的任务', state: 'running', updatedAt: 1_700_000_200_000, messageId: 'msg-run' }], hasMore: false },
      pending: { total: 0, items: [], hasMore: false },
    },
    deliverables: { total: 1, items: [{ id: 'a1', name: 'report.md', createdAt: 1_700_000_200_000, kind: 'markdown', downloadUrl: '/api/deliverables/a1/download' }], hasMore: false },
    pendingConfirmations: { total: 1 },
    ...overrides,
  }
}

export function metrics(overrides: Partial<MetricsDashboardData> = {}): MetricsDashboardData {
  return {
    range: '7d',
    timezone: 'Asia/Shanghai',
    from: 1_700_000_000_000,
    to: 1_700_600_000_000,
    totals: { ttftP50Ms: 120, ttftP90Ms: 300, durationP50Ms: 900, durationP90Ms: 1600, turns: 12, messages: 30, tasks: 5, failures: 1, promptTokens: 1000, completionTokens: 500, reasoningTokens: 100, totalTokens: 1600 },
    series: [
      { date: '2026-11-01', messages: 4, turns: 2, tasks: 1, totalTokens: 100, failures: 0 },
      { date: '2026-11-02', messages: 8, turns: 4, tasks: 2, totalTokens: 300, failures: 1 },
    ],
    partialToday: false,
    availability: { replySpeed: 'ready', ttft: 'ready', taskCompletion: 'ready', tokens: 'ready' },
    kpis: {
      tokens: { total: 1600, prompt: 1000, completion: 500, reasoning: 100 },
      topics: { newSessions: 2, activeSessions: 3 },
      messages: { total: 30, user: 12, agent: 18 },
      sessions: { total: 4, active: 3, archived: 1 },
      reply: { p50: 900, p90: 1600, sample: 12 },
      ttft: { p50: 120, p90: 300, sample: 12 },
    },
    taskQuality: {
      completionRate: { value: 0.8, numerator: 4, denominator: 5 },
      firstPassRate: { value: 0.5, numerator: 2, denominator: 4 },
      reworkRate: { value: 0.2, numerator: 1, denominator: 5 },
      response: { p50: 900, p90: 1600, sample: 12 },
    },
    ...overrides,
  }
}
