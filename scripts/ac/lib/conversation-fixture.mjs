// scripts/ac/lib/conversation-fixture.mjs
//
// 只读消息流夹具（AC-CHG-CONV-007-01 / -07 用）。
//
// 场景：会话里已经有一条 agent 发来的任务卡消息（category=task、batchId=b-1、
// taskCount=10），后端不可写。夹具只提供 GET 响应：消息列表、该批次任务列表、
// 以及一个内容长度与 size 字段一致的交付物下载响应。脚本自身不发写请求。
//
// 与 task-ui-helpers.mjs 的关系：任务列表/详情/图/投影沿用那边的 11 条任务与桩，
// 这里只在它前面追加三条只读规则（先匹配先生效）。

import { buildStub, COUNTS } from './task-ui-helpers.mjs';

export const BATCH_ID = 'b-1';
export const BATCH_TOTAL = 10;
export const CLOCK = Date.UTC(2026, 10, 24, 2, 30, 0);

/** 汇总卡批次里的 10 条任务：2 进行中、5 未开始、3 已完成。 */
export const BATCH_TASKS = [
  { id: 'b1', title: '汇总批次：采集样本', mode: 'plan', status: 'running', displayStatus: 'running', stepCount: 6, doneStepCount: 3, currentStepSeq: 4, outputCount: 0, updatedAt: 10 },
  { id: 'b2', title: '汇总批次：清洗数据', mode: 'plan', status: 'running', displayStatus: 'running', stepCount: 4, doneStepCount: 1, currentStepSeq: 2, outputCount: 0, updatedAt: 9 },
  { id: 'b3', title: '汇总批次：补指标口径', mode: 'plan', status: 'pending', displayStatus: 'pending', stepCount: 3, doneStepCount: 0, waitingReason: 'dependency', updatedAt: 8 },
  { id: 'b4', title: '汇总批次：收集截图', mode: 'plan', status: 'pending', displayStatus: 'pending', stepCount: 2, doneStepCount: 0, updatedAt: 7 },
  { id: 'b5', title: '汇总批次：整理术语', mode: 'plan', status: 'pending', displayStatus: 'pending', stepCount: 2, doneStepCount: 0, updatedAt: 6 },
  { id: 'b6', title: '汇总批次：核对下载字节', mode: 'plan', status: 'pending', displayStatus: 'pending', stepCount: 2, doneStepCount: 0, updatedAt: 5 },
  { id: 'b7', title: '汇总批次：等资源配额', mode: 'plan', status: 'pending', displayStatus: 'pending', stepCount: 2, doneStepCount: 0, waitingReason: 'resource', updatedAt: 4 },
  { id: 'b8', title: '汇总批次：归档纪要', mode: 'plan', status: 'done', displayStatus: 'done', stepCount: 3, doneStepCount: 3, outputCount: 1, updatedAt: 3 },
  { id: 'b9', title: '汇总批次：生成排期', mode: 'plan', status: 'done', displayStatus: 'done', stepCount: 2, doneStepCount: 2, outputCount: 1, updatedAt: 2 },
  { id: 'b10', title: '汇总批次：清理产物', mode: 'loop', status: 'done', displayStatus: 'done', outputCount: 0, updatedAt: 1 },
];

/** 下载夹具：2048 个 ASCII 字节，正好等于交付物 size 字段。 */
export const DOWNLOAD_SIZE = 2048;
export const DOWNLOAD_BODY = `# 一周材料汇总\n\n${'材料条目，用于核对下载字节。\n'.repeat(1)}`.padEnd(DOWNLOAD_SIZE, 'A');

/**
 * 「交付物」标签页里的第一个文件（会议纪要.md，size=3200）。
 * 该页的下载控件是 `.deliverable-open`（aria-label「下载 …」），走 window.open(downloadUrl)，
 * 因此响应带 Content-Disposition: attachment 才会落盘而不是在新标签页里渲染。
 */
export const DELIVERABLE_FILE_SIZE = 3200;
export const DELIVERABLE_BODY = `# 会议纪要\n\n${'决议与待办条目。\n'.repeat(1)}`.padEnd(DELIVERABLE_FILE_SIZE, 'B');

/** 消息列表：一条 agent 任务卡消息（batchId=b-1、taskCount=10），不带单卡 taskId。 */
export function messagesPayload() {
  return {
    messages: [{
      id: 'm-summary-1',
      sessionId: 'main',
      role: 'agent',
      text: '',
      at: CLOCK,
      status: 'done',
      category: 'task',
      batchId: BATCH_ID,
      taskCount: BATCH_TOTAL,
    }],
    hasMore: false,
  };
}

/** 该批次任务列表：total=10，counts 与右栏四筛选口径一致。 */
export function batchTasksPayload() {
  return { ok: true, tasks: BATCH_TASKS, counts: COUNTS, total: BATCH_TOTAL, hasMore: false, nextBefore: null };
}

/** 只读消息流桩：三条规则前置，其余沿用 buildStub()。 */
export function conversationStub(overrides = {}) {
  const base = buildStub(overrides);
  return {
    rules: [
      { match: '/api/messages\\?', status: 200, body: overrides.messages ?? messagesPayload() },
      { match: '/api/sessions/main/tasks\\?[^#]*batchId=b-1', status: 200, body: overrides.batchTasks ?? batchTasksPayload() },
      { match: '/api/artifacts/f1/content', status: 200, body: DELIVERABLE_BODY, headers: { 'Content-Type': 'text/markdown; charset=utf-8', 'Content-Disposition': 'attachment; filename="notes.md"' } },
      { match: '/api/artifacts/d1/content', status: 200, body: DOWNLOAD_BODY, headers: { 'Content-Type': 'text/markdown; charset=utf-8', 'Content-Disposition': 'attachment; filename="summary.md"' } },
      ...base.rules,
    ],
  };
}
