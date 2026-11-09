// app/BrandMark.tsx —— 品牌徽标（M40/M42，内联 SVG；小圆角方形，无渐变/发光）
//
// 形状与 frontend/public/icon.svg 一致：小圆角方徽标 + 对话气泡 + 墨滴，主题 accent 纯色。
// 内联渲染，随页面缩放；aria-label 供读屏。

export default function BrandMark({ className = 'h-7 w-7' }: { className?: string }) {
  return (
    <svg viewBox="0 0 256 256" className={`${className} flex-none`} role="img" aria-label="司墨">
      <rect width="256" height="256" rx="24" fill="var(--accent)" />
      <path
        d="M60 82c0-13.3 10.7-24 24-24h88c13.3 0 24 10.7 24 24v58c0 13.3-10.7 24-24 24h-36l-28 26v-26h-24c-13.3 0-24-10.7-24-24z"
        fill="var(--surface-solid)"
        opacity="0.97"
      />
      <path
        d="M128 84c15.5 20.6 24 34.1 24 45.2C152 147 141.3 158 128 158s-24-11-24-28.8C104 118.1 112.5 104.6 128 84z"
        fill="var(--accent-hover)"
      />
      <circle cx="128" cy="136" r="7" fill="var(--surface-solid)" opacity="0.92" />
    </svg>
  )
}
