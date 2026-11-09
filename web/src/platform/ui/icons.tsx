// platform/ui/icons.tsx —— M40 统一线性图标（1.5px stroke，currentColor，16/20）
//
// 禁止 emoji / 汉字图标；所有图标只做装饰或配合 aria-label 的图标按钮。
// 线宽固定 1.5、两档尺寸、无填充。

import type { ReactNode, SVGProps } from 'react'

export type IconName =
  | 'search'
  | 'plus'
  | 'close'
  | 'chevron-down'
  | 'chevron-up'
  | 'chevron-left'
  | 'chevron-right'
  | 'pin'
  | 'check'
  | 'alert'
  | 'info'
  | 'refresh'
  | 'settings'
  | 'task'
  | 'overview'
  | 'file'
  | 'panel'
  | 'send'
  | 'stop'
  | 'more'
  | 'sort'
  | 'external'
  | 'trash'
  | 'copy'
  | 'edit'
  | 'folder'
  | 'clock'
  | 'user'
  | 'spark'
  | 'star'
  | 'square'
  | 'bold'
  | 'italic'
  | 'list'
  | 'ordered-list'
  | 'code'
  | 'link'

const PATHS: Record<IconName, ReactNode> = {
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  'chevron-down': <path d="m6 9 6 6 6-6" />,
  'chevron-up': <path d="m6 15 6-6 6 6" />,
  'chevron-left': <path d="m15 6-6 6 6 6" />,
  'chevron-right': <path d="m9 6 6 6-6 6" />,
  pin: <><path d="M9 4h6l-1 6 4 3v2H6v-2l4-3-1-6Z" /><path d="M12 15v5" /></>,
  check: <path d="m5 12 4 4L19 6" />,
  alert: <><path d="M12 4 3 20h18L12 4Z" /><path d="M12 10v4M12 17h.01" /></>,
  info: <><circle cx="12" cy="12" r="8" /><path d="M12 11v5M12 8h.01" /></>,
  refresh: <><path d="M20 11a8 8 0 0 0-14.9-4M4 5v5h5" /><path d="M4 13a8 8 0 0 0 14.9 4M20 19v-5h-5" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2 3.4-.1-.1a1.7 1.7 0 0 0-2-.5 1.7 1.7 0 0 0-1 1.6V21h-4v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-2 .5l-.1.1-2-3.4.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3v-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1 2-3.4.1.1a1.7 1.7 0 0 0 2 .5 1.7 1.7 0 0 0 1-1.6V3h4v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 2-.5l.1-.1 2 3.4-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.5 1h.1v4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></>,
  task: <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4M16 3v4M8 11h8M8 15h5" /></>,
  overview: <><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M8 9h8M8 13h8M8 17h4" /></>,
  file: <><path d="M6 3h8l4 4v14H6V3Z" /><path d="M14 3v5h5M9 13h6M9 17h6" /></>,
  panel: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M15 4v16" /></>,
  send: <><path d="m4 12 16-8-5 16-3-6-8-2Z" /><path d="m12 14 3-3" /></>,
  stop: <rect x="7" y="7" width="10" height="10" rx="1" />,
  more: <><circle cx="6" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="18" cy="12" r="1" /></>,
  sort: <><path d="M8 5v14M8 5 5 8M8 5l3 3" /><path d="M16 19V5M16 19l3-3M16 19l-3-3" /></>,
  external: <><path d="M14 4h6v6M20 4l-9 9" /><path d="M18 14v5H5V6h5" /></>,
  trash: <><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" /><path d="M10 11v5M14 11v5" /></>,
  copy: <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></>,
  edit: <><path d="m4 20 4-1 11-11-3-3L5 16l-1 4Z" /><path d="m14 6 3 3" /></>,
  folder: <path d="M3 6h7l2 2h9v12H3V6Z" />,
  clock: <><circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2" /></>,
  user: <><circle cx="12" cy="8" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" /></>,
  spark: <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18" />,
  star: <path d="m12 4 2.4 5 5.6.8-4 3.9 1 5.5-5-2.6-5 2.6 1-5.5-4-3.9 5.6-.8L12 4Z" />,
  square: <rect x="5" y="5" width="14" height="14" rx="2" />,
  bold: <><path d="M7 5h6a4 4 0 0 1 0 8H7V5Z" /><path d="M7 13h7a4 4 0 0 1 0 8H7v-8Z" /></>,
  italic: <><path d="M19 5h-7M12 19H5M15 5 9 19" /></>,
  list: <><path d="M9 6h11M9 12h11M9 18h11" /><path d="M4 6h.01M4 12h.01M4 18h.01" /></>,
  'ordered-list': <><path d="M10 6h10M10 12h10M10 18h10" /><path d="M4 5h2v4M4 9h2M4 15h2v4M4 19h2" /></>,
  code: <><path d="m8 6-5 6 5 6M16 6l5 6-5 6" /></>,
  link: <><path d="M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1" /><path d="M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1" /></>,
}

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name' | 'children'> {
  name: IconName
  size?: 16 | 20
}

export function Icon({ name, size = 16, className = '', ...rest }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={`inline-block flex-none ${className}`}
      {...rest}
    >
      {PATHS[name]}
    </svg>
  )
}
