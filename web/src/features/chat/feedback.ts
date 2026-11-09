// features/chat/feedback.ts —— 三速反馈的纯逻辑（M7）
//
// 设计依据：M7「三速反馈视觉」：
//   1) 语义确认 <500ms：发送后立即显示「已收到」；
//   2) 首个内容 1–3s：等待期间显示「司墨正在想…」，超时转入「还在处理」；
//   3) 派发状态：任务/子会话创建后显示「已派发后台任务」（由 chat 运行时处理）。
// 这里只做时间 → 阶段/文案的纯映射，便于单测；定时器在运行时里驱动。

export type FeedbackPhase = 'idle' | 'ack' | 'thinking' | 'slow'

export const ACK_WINDOW_MS = 500
export const THINKING_WINDOW_MS = 2600

/** 根据等待时长给出阶段；ack 是发送瞬间（≤500ms）的语义确认。 */
export function phaseForElapsed(elapsedMs: number): FeedbackPhase {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return 'idle'
  if (elapsedMs < ACK_WINDOW_MS) return 'ack'
  if (elapsedMs < THINKING_WINDOW_MS) return 'thinking'
  return 'slow'
}

export function feedbackLabel(phase: FeedbackPhase): string {
  switch (phase) {
    case 'ack':
      return '已收到，正在处理…'
    case 'thinking':
      return '司墨正在想…（输入框仍然可用，可随时补充）'
    case 'slow':
      return '还在处理；右栏可看任务/子会话进度，或撤回这条回复'
    default:
      return ''
  }
}

/** 三速反馈视觉的 aria 文案（读屏用，避免频繁打断）。 */
export function feedbackAnnouncement(phase: FeedbackPhase): string {
  if (phase === 'ack') return '消息已收到'
  if (phase === 'thinking') return '司墨正在思考'
  if (phase === 'slow') return '司墨仍在处理'
  return ''
}

export type ComposerIntent = 'send' | 'newline' | 'ignore'

/** 键盘映射：Enter 发送；Shift+Enter 换行；输入法组词期间 Enter 不发送。 */
export function composerIntent(key: string, shiftKey: boolean, isComposing: boolean): ComposerIntent {
  if (key !== 'Enter') return 'ignore'
  if (isComposing) return 'ignore'
  return shiftKey ? 'newline' : 'send'
}

/** 发送后到首帧之间的等待提示（已撤回/已完成时清空）。 */
export function shouldShowFeedback(phase: FeedbackPhase, hasStreamingReply: boolean): boolean {
  if (hasStreamingReply) return false
  return phase !== 'idle'
}

export interface FeedbackTimers {
  thinking: ReturnType<typeof setTimeout> | null
  slow: ReturnType<typeof setTimeout> | null
}

/** 清掉三速反馈的定时器（发送被响应/切换会话/卸载时调用）。 */
export function clearFeedbackTimers(timers: FeedbackTimers): void {
  if (timers.thinking !== null) {
    clearTimeout(timers.thinking)
    timers.thinking = null
  }
  if (timers.slow !== null) {
    clearTimeout(timers.slow)
    timers.slow = null
  }
}
