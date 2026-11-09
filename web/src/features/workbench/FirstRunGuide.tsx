// features/workbench/FirstRunGuide.tsx —— 首启引导（M40：统一 Dialog/Button）
import { Dialog } from '../../platform/ui/Dialog.tsx'
import { Button } from '../../platform/ui/Button.tsx'
import { Icon } from '../../platform/ui/icons.tsx'

export default function FirstRunGuide({
  onClose,
  onOpenSettings,
}: {
  onClose: () => void
  onOpenSettings: () => void
}) {
  return (
    <Dialog
      open
      onClose={onClose}
      title="欢迎使用司墨"
      description="一句话开始：说需求、让它记住；需要干活时它会派后台任务并把结果汇报回会话。"
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onOpenSettings}>打开设置</Button>
          <Button variant="primary" onClick={onClose}>开始对话</Button>
        </>
      }
    >
      <ul className="m-0 grid list-none gap-2 p-0 text-sm text-ink-secondary">
        <li className="flex items-start gap-2">
          <Icon name="send" size={16} className="mt-0.5 text-muted" />
          <span><strong className="text-ink">对话</strong> · 直接说要做的事；右栏看任务与产物。</span>
        </li>
        <li className="flex items-start gap-2">
          <Icon name="overview" size={16} className="mt-0.5 text-muted" />
          <span><strong className="text-ink">记忆/智能体</strong> · 顶部 tab 查看记忆与可用人格。</span>
        </li>
        <li className="flex items-start gap-2">
          <Icon name="search" size={16} className="mt-0.5 text-muted" />
          <span><strong className="text-ink">Ctrl/⌘+K</strong> · 命令面板：切会话、建会话、改权限、用量与设置。</span>
        </li>
        <li className="flex items-start gap-2">
          <Icon name="edit" size={16} className="mt-0.5 text-muted" />
          <span><strong className="text-ink">@ / 斜杠</strong> · 输入框 @ 引用会话/文件；/archive、/rename、/pause、/model。</span>
        </li>
      </ul>
    </Dialog>
  )
}
