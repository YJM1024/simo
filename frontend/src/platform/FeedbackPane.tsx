// platform/FeedbackPane.tsx —— M40 统一空态/错误态/加载态（组件层）
//
// 使用 platform/ui 的 Skeleton/EmptyState/Button；调用方负责按钮动作，页面语义保持一致。

import { Button } from './ui/Button.tsx'
import { EmptyState } from './ui/EmptyState.tsx'
import { Icon } from './ui/icons.tsx'
import { Skeleton } from './ui/Skeleton.tsx'

export function LoadingPane({ label = '加载中…', rows = 3 }: { label?: string; rows?: number }) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-2" aria-label={label}>
      <span className="sr-only">{label}</span>
      <Skeleton lines={rows} />
    </div>
  )
}

export function EmptyPane({
  title,
  description,
  compact = false,
}: {
  title: string
  description?: string
  compact?: boolean
}) {
  return <EmptyState title={title} description={description} compact={compact} />
}

export function ErrorPane({
  title = '加载失败',
  message,
  onRetry,
}: {
  title?: string
  message: string
  onRetry?: () => void
}) {
  return (
    <div role="alert" className="min-w-0 rounded-md border border-danger-border bg-danger-soft px-3 py-3">
      <p className="m-0 flex items-center gap-2 text-sm font-medium text-danger-ink">
        <Icon name="alert" size={16} />
        {title}
      </p>
      <p className="m-0 mt-1 break-words text-xs leading-relaxed text-danger-ink">{message}</p>
      {onRetry && (
        <Button size="sm" variant="secondary" icon="refresh" onClick={onRetry} className="mt-2">
          重试
        </Button>
      )}
    </div>
  )
}
