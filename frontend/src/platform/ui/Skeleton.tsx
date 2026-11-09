// platform/ui/Skeleton.tsx —— M40 骨架（低频 pulse，reduced-motion 自动关闭）
export function Skeleton({ className = '', lines = 1 }: { className?: string; lines?: number }) {
  return (
    <div role="status" aria-busy="true" aria-label="加载中" className="flex flex-col gap-2">
      {Array.from({ length: Math.max(1, lines) }).map((_, index) => (
        <span key={index} className={`block h-8 rounded-xs bg-surface-sunken motion-safe:animate-pulse ${className}`} style={{ width: `${100 - index * 8}%` }} aria-hidden="true" />
      ))}
    </div>
  )
}

export function SkeletonBlock({ className = '' }: { className?: string }) {
  return <span className={`block rounded-xs bg-surface-sunken motion-safe:animate-pulse ${className}`} aria-hidden="true" />
}
