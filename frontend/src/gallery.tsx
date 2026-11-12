import { useRef, useState } from 'react'
import {
  CardBlock,
  Composer,
  DeliverableItem,
  EmptyState,
  ErrorState,
  ConversationPanel,
  MessageItem,
  LoadingState,
  Icon,
  List,
  Section,
  SectionHeader,
  Segmented,
  StatusBar,
  TaskItem,
  Timeline,
  TimelineGroups,
  TimelineTip,
  WorkbenchChart,
} from './components'
import type { Artifact, Card, Message, Task } from './types'

const sampleTasks: Task[] = [
  { id: 'g1', sessionId: 'main', title: '校验字段结构', status: 'done', createdAt: Date.now() - 180000, updatedAt: Date.now() },
  { id: 'g2', sessionId: 'main', title: '汇总成交量', status: 'done', createdAt: Date.now() - 120000, updatedAt: Date.now() },
  { id: 'g3', sessionId: 'main', title: '生成对比表', status: 'running', createdAt: Date.now() - 60000, updatedAt: Date.now() },
]
const sampleArtifact: Artifact = { id: 'a1', name: 'report-attempt-1.md', mime: 'text/markdown', size: 2048, createdAt: Date.now() }
const sampleMessages: Message[] = [
  { id: 'm1', sessionId: 'main', role: 'user', text: '先做一份数据核查。', at: Date.now() - 90000, status: 'done' },
  { id: 'm2', sessionId: 'main', role: 'agent', text: '可以。先确认三件事，方案会按你的选择定。', at: Date.now() - 60000, status: 'done', agentId: 'simo', category: 'clarification' },
]
const codeMessage: Message = { id: 'code-message', sessionId: 'main', role: 'agent', text: '示例代码：\n```ts\nconst value: string = "<script>alert(1)</script>"\nconsole.log(value)\nconst veryLongLine = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"\nconsole.log(veryLongLine)\n```\n行内 `inlineCode` 与安全文本 <b>不会变成 HTML</b>。', at: Date.now() - 30000, status: 'done', agentId: 'simo', category: 'progress' }
const sampleCard: Card = {
  id: 'card-gallery',
  sessionId: 'main',
  messageId: 'm2',
  version: 1,
  status: 'active',
  schema: {
    title: '选择数据来源',
    blocks: [
      { id: 't1', type: 'text', props: { text: 'workspace 当前有 1 个 csv 文件；也可以改用公开行情。' } },
      { id: 'f1', type: 'form', props: { submitLabel: '确认', fields: [{ kind: 'select', label: '数据来源', name: 'source', options: ['A · 使用 workspace csv', 'B · 联网抓取', 'C · 只做定性分析'] }] } },
    ],
  },
}

export default function ComponentGallery(): React.ReactNode {
  const [tab, setTab] = useState<'chat' | 'workbench'>('chat')
  const keyboardAnchor = useRef<HTMLButtonElement>(null)
  const edgeAnchor = useRef<HTMLButtonElement>(null)
  const [tipMode, setTipMode] = useState<'keyboard' | 'edge' | null>(null)
  const [lastJump, setLastJump] = useState('')
  const [singleActive, setSingleActive] = useState('g1')
  const [multiActive, setMultiActive] = useState('m3')
  const hoverTimer = useRef<number | null>(null)
  const closeTimer = useRef<number | null>(null)
  return (
    <main className="component-gallery">
      <header className="component-gallery-head">
        <h1>React 组件画廊</h1>
        <p>唯一组件库 `src/components` · 页面与画廊同源 · 新增组件先在此登记</p>
      </header>
      <Section title="Segmented 页面切换"><Segmented value={tab} onChange={setTab} /></Section>
      <Section title="TaskItem / StatusDot">
        <SectionHeader title="已完成" meta="3/3" />
        <List>{sampleTasks.map((task) => <TaskItem key={task.id} task={task} tone={task.status === 'done' ? 'done' : 'running'} />)}</List>
      </Section>
      <Section title="LoadingState / ErrorState"><div className="grid-2"><LoadingState label="加载中…" /><ErrorState title="加载失败" description="接口不可用，可重试。" onRetry={() => undefined} /></div></Section>
      <Section title="EmptyState"><EmptyState title="暂无进行中任务" description="任务开始后会出现在这里。" /></Section>
      <Section title="DeliverableItem"><List><DeliverableItem artifact={sampleArtifact} /></List></Section>
      <Section title="ConversationPanel"><ConversationPanel timeline={<Timeline messages={sampleMessages} active={1} onJump={() => undefined} />}><div className="chat-inner"><MessageItem message={sampleMessages[0]} onCardAction={async () => undefined} /><MessageItem message={sampleMessages[1]} onCardAction={async () => undefined} /></div></ConversationPanel></Section>
      <Section title="TimelineGroups 单会话"><span className="insp-text">onJump: {lastJump || '—'}</span>
        <TimelineGroups currentSessionId="main" activeMessageId={singleActive} onJump={(id) => { setLastJump(id); setSingleActive(id) }} messages={[
          { id: 'g1', sessionId: 'main', sessionTitle: '主会话', sessionOrder: 0, isCurrentSession: true, role: 'user', at: 1, dateKey: '2026-11-12', summary: '单会话样例 1' },
          { id: 'g2', sessionId: 'main', sessionTitle: '主会话', sessionOrder: 0, isCurrentSession: true, role: 'agent', at: 2, dateKey: '2026-11-12', category: 'progress', summary: '单会话样例 2' },
          { id: 'g3', sessionId: 'main', sessionTitle: '主会话', sessionOrder: 0, isCurrentSession: true, role: 'user', at: 3, dateKey: '2026-11-13', summary: '单会话样例 3' },
        ]} />
      </Section>
      <Section title="TimelineGroups 当前 + 上级会话"><span className="insp-text">onJump: {lastJump || '—'}</span>
        <TimelineGroups currentSessionId="main" activeMessageId={multiActive} onJump={(id) => { setLastJump(id); setMultiActive(id) }} messages={[
          { id: 'p1', sessionId: 'parent', sessionTitle: '研究员-验收', sessionOrder: 0, isCurrentSession: false, role: 'user', at: 1, dateKey: '2026-11-11', summary: '上级会话消息' },
          { id: 'p2', sessionId: 'parent', sessionTitle: '研究员-验收', sessionOrder: 0, isCurrentSession: false, role: 'agent', at: 2, dateKey: '2026-11-11', category: 'result', summary: '上级会话结果' },
          { id: 'm1', sessionId: 'main', sessionTitle: '主会话', sessionOrder: 1, isCurrentSession: true, role: 'user', at: 3, dateKey: '2026-11-12', summary: '当前会话消息 1' },
          { id: 'm2', sessionId: 'main', sessionTitle: '主会话', sessionOrder: 1, isCurrentSession: true, role: 'agent', at: 4, dateKey: '2026-11-12', category: 'clarification', summary: '当前会话澄清' },
          { id: 'm3', sessionId: 'main', sessionTitle: '主会话', sessionOrder: 1, isCurrentSession: true, role: 'user', at: 5, dateKey: '2026-11-13', summary: '当前会话消息 2' },
        ]} />
      </Section>
      <Section title="TimelineTip 消息预览">
        <div className="timeline-tip-stage">
          <button
            ref={keyboardAnchor}
            className="tl-bar is-user timeline-tip-tick"
            type="button"
            aria-label="键盘 focus 示例刻度"
            aria-describedby={tipMode === 'keyboard' ? 'timeline-tip' : undefined}
            onMouseEnter={() => { if (closeTimer.current) clearTimeout(closeTimer.current); if (hoverTimer.current) clearTimeout(hoverTimer.current); hoverTimer.current = window.setTimeout(() => setTipMode('keyboard'), 120) }}
            onMouseLeave={() => { if (closeTimer.current) clearTimeout(closeTimer.current); closeTimer.current = window.setTimeout(() => setTipMode(null), 200) }}
            onFocus={() => { if (closeTimer.current) clearTimeout(closeTimer.current); setTipMode('keyboard') }}
            onBlur={() => { if (closeTimer.current) clearTimeout(closeTimer.current); closeTimer.current = window.setTimeout(() => setTipMode(null), 200) }}
          />
          <span className="insp-text">键盘 focus / hover 120ms / 移出 200ms grace；focus ring 在 tick 上。</span>
        </div>
        <div className="timeline-tip-stage timeline-tip-stage--edge">
          <span className="insp-text">右侧空间不足时左翻（edge-clamped）。</span>
          <button
            ref={edgeAnchor}
            className="tl-bar is-agent timeline-tip-tick"
            type="button"
            aria-label="edge clamp 示例刻度"
            aria-describedby={tipMode === 'edge' ? 'timeline-tip' : undefined}
            onMouseEnter={() => { if (closeTimer.current) clearTimeout(closeTimer.current); if (hoverTimer.current) clearTimeout(hoverTimer.current); hoverTimer.current = window.setTimeout(() => setTipMode('edge'), 120) }}
            onMouseLeave={() => { if (closeTimer.current) clearTimeout(closeTimer.current); closeTimer.current = window.setTimeout(() => setTipMode(null), 200) }}
            onFocus={() => { if (closeTimer.current) clearTimeout(closeTimer.current); setTipMode('edge') }}
            onBlur={() => { if (closeTimer.current) clearTimeout(closeTimer.current); closeTimer.current = window.setTimeout(() => setTipMode(null), 200) }}
          />
        </div>
        {tipMode && <TimelineTip open anchorRef={tipMode === 'keyboard' ? keyboardAnchor : edgeAnchor} sender={tipMode === 'keyboard' ? 'user' : 'agent'} sessionTitle="主会话" timeLabel={tipMode === 'keyboard' ? '14:20' : '14:22'} summary="这是一条用于画廊登记的消息摘要，最多显示两行，超出后截断。这里刻意写长，验证 line-clamp 与浮层宽度。" onClose={() => setTipMode(null)} />}
      </Section>
      <Section title="Timeline / Message">
        <Timeline messages={sampleMessages} active={1} onJump={() => undefined} />
        <p className="insp-text">时间轴 44px gutter、20×4、gap2；消息组件由 MessageItem 组合。</p>
      </Section>
      <Section title="Message categories 四类">
        {(['requirement','clarification','progress','consultation'] as const).map((category, index) => <MessageItem key={category} message={{ id: `cat-${category}`, sessionId: 'main', role: 'agent', text: `分类样例：${category}`, at: Date.now() - index * 1000, status: 'done', agentId: 'simo', category }} onCardAction={async () => undefined} />)}
      </Section>
      <Section title="Message Markdown code"><MessageItem message={codeMessage} onCardAction={async () => undefined} /></Section>
      <Section title="Composer"><Composer disabled={false} streaming={false} onSend={async () => undefined} onStop={() => undefined} sendError="" /></Section>
      <Section title="WorkbenchChart"><WorkbenchChart buckets={[{ label: '2026-11-10', messages: 2, tokens: 0, tasks: 0, start: 0 }, { label: '2026-11-11', messages: 5, tokens: 0, tasks: 0, start: 0 }, { label: '2026-11-12', messages: 9, tokens: 0, tasks: 0, start: 0 }]} /></Section>
      <Section title="CardBlock"><CardBlock card={sampleCard} onSubmit={async () => undefined} /></Section>
      <Section title="StatusBar"><StatusBar connection="open" /></Section>
      <Section title="Icon"><div className="gallery-icon-row"><Icon name="search" /><Icon name="refresh" /><Icon name="file" /><Icon name="gear" /></div></Section>
    </main>
  )
}
