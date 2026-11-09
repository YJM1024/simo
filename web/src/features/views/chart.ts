// features/views/chart.ts —— M34 图表块纯几何（bar/line/pie，宿主 SVG，无图表库）
//
// 输入来自只读数据绑定或 props；输出几何坐标，渲染器用 SVG + 主题 token 颜色绘制。
// 不生成 HTML/style；不可信 label 只作为 React 文本/aria 文本。

export type ChartKind = 'bar' | 'line' | 'pie'

export interface ChartPoint {
  label: string
  value: number
}

export interface BarRect extends ChartPoint {
  x: number
  y: number
  width: number
  height: number
}

export interface LinePoint extends ChartPoint {
  x: number
  y: number
}

export interface PieSlice extends ChartPoint {
  path: string
  percent: number
}

export function normalizeChartKind(value: unknown): ChartKind {
  return value === 'line' || value === 'pie' ? value : 'bar'
}

export function normalizeChartPoints(raw: unknown): ChartPoint[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((entry, index) => {
      if (typeof entry === 'number' && Number.isFinite(entry)) return { label: String(index + 1), value: entry }
      if (!entry || typeof entry !== 'object') return null
      const record = entry as Record<string, unknown>
      const label = typeof record['label'] === 'string' ? record['label'] : typeof record['name'] === 'string' ? record['name'] : typeof record['x'] === 'string' ? record['x'] : String(index + 1)
      const valueRaw = record['value'] ?? record['y'] ?? record['count']
      const numeric = typeof valueRaw === 'number' ? valueRaw : Number(valueRaw)
      if (!Number.isFinite(numeric)) return null
      return { label, value: numeric }
    })
    .filter((point): point is ChartPoint => point !== null)
    .slice(0, 50)
}

/** 柱状图：等宽柱，按最大值归一化；返回值域 [0,height]。 */
export function barGeometry(points: readonly ChartPoint[], width: number, height: number, padding = 4): BarRect[] {
  if (points.length === 0) return []
  const max = Math.max(...points.map((point) => point.value), 0) || 1
  const gap = points.length > 1 ? 6 : 0
  const barWidth = Math.max(2, (width - padding * 2 - gap * (points.length - 1)) / points.length)
  return points.map((point, index) => {
    const barHeight = Math.max(0, (point.value / max) * (height - padding * 2))
    return {
      ...point,
      x: padding + index * (barWidth + gap),
      y: height - padding - barHeight,
      width: barWidth,
      height: barHeight,
    }
  })
}

/** 折线图：等距 x，按最大值归一化。 */
export function lineGeometry(points: readonly ChartPoint[], width: number, height: number, padding = 4): LinePoint[] {
  if (points.length === 0) return []
  const max = Math.max(...points.map((point) => point.value), 0) || 1
  const step = points.length > 1 ? (width - padding * 2) / (points.length - 1) : 0
  return points.map((point, index) => ({
    ...point,
    x: padding + index * step,
    y: height - padding - (point.value / max) * (height - padding * 2),
  }))
}

function polar(cx: number, cy: number, radius: number, angle: number): { x: number; y: number } {
  return { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) }
}

/** 饼图：从 12 点方向顺时针；path 为 SVG d 字符串（纯数字，无用户输入拼接）。 */
export function pieGeometry(points: readonly ChartPoint[], size: number): PieSlice[] {
  const total = points.reduce((sum, point) => sum + Math.max(0, point.value), 0)
  if (total <= 0) return []
  const cx = size / 2
  const cy = size / 2
  const radius = size / 2 - 2
  let angle = -Math.PI / 2
  return points.map((point) => {
    const percent = Math.max(0, point.value) / total
    const sweep = percent * Math.PI * 2
    const start = polar(cx, cy, radius, angle)
    const end = polar(cx, cy, radius, angle + sweep)
    const largeArc = sweep > Math.PI ? 1 : 0
    const path = `M ${cx.toFixed(2)} ${cy.toFixed(2)} L ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${radius.toFixed(2)} ${radius.toFixed(2)} 0 ${largeArc} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)} Z`
    angle += sweep
    return { ...point, path, percent }
  })
}

export function chartSummary(points: readonly ChartPoint[]): string {
  if (points.length === 0) return '暂无图表数据'
  const total = points.reduce((sum, point) => sum + point.value, 0)
  return `${points.length} 项，合计 ${total}`
}
