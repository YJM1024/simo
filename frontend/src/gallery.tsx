import { useState } from 'react'
import {
  CardBlock,
  Composer,
  DeliverableItem,
  EmptyState,
  Icon,
  List,
  Section,
  SectionHeader,
  Segmented,
  StatusBar,
  TaskItem,
  Timeline,
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
      <Section title="EmptyState"><EmptyState title="暂无进行中任务" description="任务开始后会出现在这里。" /></Section>
      <Section title="DeliverableItem"><List><DeliverableItem artifact={sampleArtifact} /></List></Section>
      <Section title="Timeline / Message">
        <Timeline messages={sampleMessages} active={1} onJump={() => undefined} />
        <p className="insp-text">时间轴 44px gutter、20×4、gap2；消息组件由 MessageItem 组合。</p>
      </Section>
      <Section title="Composer"><Composer disabled={false} onSend={async () => undefined} /></Section>
      <Section title="WorkbenchChart"><WorkbenchChart buckets={[{ label: '2026-11-10', messages: 2, tokens: 0, tasks: 0, start: 0 }, { label: '2026-11-11', messages: 5, tokens: 0, tasks: 0, start: 0 }, { label: '2026-11-12', messages: 9, tokens: 0, tasks: 0, start: 0 }]} /></Section>
      <Section title="CardBlock"><CardBlock card={sampleCard} onSubmit={async () => undefined} /></Section>
      <Section title="StatusBar"><StatusBar connection="open" /></Section>
      <Section title="Icon"><div className="gallery-icon-row"><Icon name="search" /><Icon name="refresh" /><Icon name="file" /><Icon name="gear" /></div></Section>
    </main>
  )
}
