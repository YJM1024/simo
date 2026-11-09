// platform/ui/Table.tsx —— M40 统一表格（zebra/hover/数字右对齐/tabular-nums）
import type { HTMLAttributes, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from 'react'

export function Table({ children, className = '', ...rest }: { children: ReactNode; className?: string } & HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="min-w-0 overflow-x-auto">
      <table className={`w-full border-collapse text-xs ${className}`} {...rest}>{children}</table>
    </div>
  )
}

export function TableHead({ children }: { children: ReactNode }) {
  return <thead className="bg-surface-sunken">{children}</thead>
}

export function TableBody({ children }: { children: ReactNode }) {
  return <tbody className="[&>tr:nth-child(even)]:bg-surface-sunken/40 [&>tr:hover]:bg-accent-soft/40">{children}</tbody>
}

export function TableRow({ children, className = '', ...rest }: { children: ReactNode } & HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={`border-b border-border-subtle last:border-0 ${className}`} {...rest}>{children}</tr>
}

export function TableHeaderCell({ children, numeric = false, className = '', ...rest }: { children: ReactNode; numeric?: boolean } & ThHTMLAttributes<HTMLTableCellElement>) {
  return <th scope="col" className={`h-8 border-b border-border-subtle px-2 text-xs font-medium text-ink-secondary ${numeric ? 'text-right tabular-nums' : 'text-left'} ${className}`} {...rest}>{children}</th>
}

export function TableCell({ children, numeric = false, className = '', ...rest }: { children: ReactNode; numeric?: boolean } & TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={`h-9 border-b border-border-subtle px-2 text-sm text-ink ${numeric ? 'text-right font-mono tabular-nums' : 'text-left'} ${className}`} {...rest}>{children}</td>
}
