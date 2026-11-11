// features/views/interactions.ts —— M28/M33 视图块交互纯逻辑（表单校验/表格排序分页）
//
// 展示状态（排序/分页）允许留在前端；提交/行操作/看板移动仍只走动作层（onRunAction），失败不伪装成功。

import type { ViewActionBinding } from './schema.ts'

export interface FormFieldDef {
  name: string
  label: string
  type: string
  required: boolean
  options: string[]
  placeholder: string
}

export function normalizeFormFields(raw: unknown): FormFieldDef[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((entry, index) => {
      if (!entry || typeof entry !== 'object') return null
      const record = entry as Record<string, unknown>
      const name = typeof record['name'] === 'string' && record['name'] ? record['name'] : `field-${index}`
      const kind = typeof record['type'] === 'string' && record['type']
        ? record['type']
        : typeof record['kind'] === 'string' && record['kind']
          ? record['kind']
          : 'text'
      return {
        name,
        label: typeof record['label'] === 'string' && record['label'] ? record['label'] : name,
        type: kind,
        required: record['required'] === true,
        options: Array.isArray(record['options'])
          ? record['options']
              .map((option) => (typeof option === 'string' ? option : option && typeof option === 'object' && typeof (option as Record<string, unknown>)['value'] === 'string' ? (option as Record<string, unknown>)['value'] as string : ''))
              .filter(Boolean)
          : [],
        placeholder: typeof record['placeholder'] === 'string' ? record['placeholder'] : '',
      }
    })
    .filter((field): field is FormFieldDef => field !== null)
    .slice(0, 20)
}

function isEmptyValue(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === 'string' && value.trim() === '')
}

/** 表单校验：必填 / number / date / select 选项；返回 字段→可读错误。 */
export function validateForm(fields: readonly FormFieldDef[], values: Record<string, unknown>): Record<string, string> {
  const errors: Record<string, string> = {}
  for (const field of fields) {
    const value = values[field.name]
    if (field.required && isEmptyValue(value)) {
      errors[field.name] = `${field.label}为必填项`
      continue
    }
    if (isEmptyValue(value)) continue
    if (field.type === 'number' && !Number.isFinite(Number(value))) {
      errors[field.name] = `${field.label}需为数字`
    } else if (field.type === 'date' && typeof value === 'string' && Number.isNaN(Date.parse(value))) {
      errors[field.name] = `${field.label}需为有效日期`
    } else if (field.type === 'select' && field.options.length > 0 && !field.options.includes(String(value))) {
      errors[field.name] = `${field.label}不在可选范围内`
    }
  }
  return errors
}

export function sortRows(rows: readonly Record<string, unknown>[], key: string, dir: 'asc' | 'desc'): Record<string, unknown>[] {
  const factor = dir === 'asc' ? 1 : -1
  return [...rows].sort((left, right) => {
    const a = left[key]
    const b = right[key]
    if (typeof a === 'number' && typeof b === 'number') return (a - b) * factor
    return String(a ?? '').localeCompare(String(b ?? ''), 'zh-CN') * factor
  })
}

export interface PagedRows {
  rows: Record<string, unknown>[]
  page: number
  totalPages: number
  from: number
  to: number
  total: number
}

/** 分页（展示状态）：pageSize ≤100；页码越界自动 clamp。 */
export function paginateRows(rows: readonly Record<string, unknown>[], page: number, pageSize: number): PagedRows {
  const size = Math.max(1, Math.min(100, Math.floor(pageSize) || 20))
  const total = rows.length
  const totalPages = Math.max(1, Math.ceil(total / size))
  const current = Math.max(1, Math.min(totalPages, Math.floor(page) || 1))
  const start = (current - 1) * size
  const slice = rows.slice(start, start + size)
  return {
    rows: slice,
    page: current,
    totalPages,
    from: total === 0 ? 0 : start + 1,
    to: Math.min(total, start + size),
    total,
  }
}

/** 看板目标列是否有可用语义动作（用于无绑定提示/禁用键盘选项）。 */
export function hasActionBinding(bindings: readonly ViewActionBinding[]): boolean {
  return bindings.length > 0
}

export interface FormStep {
  title: string
  fields: FormFieldDef[]
}

/** 多步表单：props.steps[]；无 steps 时用 fields 作为单步。 */
export function normalizeFormSteps(props: Record<string, unknown>): FormStep[] {
  if (Array.isArray(props['steps'])) {
    const steps = props['steps']
      .map((entry, index) => {
        const record = entry && typeof entry === 'object' ? (entry as Record<string, unknown>) : {}
        const fields = normalizeFormFields(record['fields'])
        if (fields.length === 0) return null
        return { title: typeof record['title'] === 'string' && record['title'] ? record['title'] : `第 ${index + 1} 步`, fields }
      })
      .filter((step): step is FormStep => step !== null)
    if (steps.length > 0) return steps.slice(0, 10)
  }
  return [{ title: '填写', fields: normalizeFormFields(props['fields']) }]
}

/** 合并所有步骤的字段校验（提交前总校验）。 */
export function validateFormSteps(steps: readonly FormStep[], values: Record<string, unknown>): Record<string, string> {
  const errors: Record<string, string> = {}
  for (const step of steps) {
    Object.assign(errors, validateForm(step.fields, values))
  }
  return errors
}

export function stepIndexOfField(steps: readonly FormStep[], fieldName: string): number {
  const index = steps.findIndex((step) => step.fields.some((field) => field.name === fieldName))
  return index < 0 ? 0 : index
}

/** 多列排序：按顺序依次比较；允许切换升降/移除。 */
export function sortRowsMulti(
  rows: readonly Record<string, unknown>[],
  sorts: ReadonlyArray<{ key: string; dir: 'asc' | 'desc' }>,
): Record<string, unknown>[] {
  if (sorts.length === 0) return [...rows]
  return [...rows].sort((left, right) => {
    for (const sort of sorts) {
      const factor = sort.dir === 'asc' ? 1 : -1
      const a = left[sort.key]
      const b = right[sort.key]
      let compared: number
      if (typeof a === 'number' && typeof b === 'number') compared = a - b
      else compared = String(a ?? '').localeCompare(String(b ?? ''), 'zh-CN')
      if (compared !== 0) return compared * factor
    }
    return 0
  })
}

/** 点击表头：无排序→升序；升序→降序；降序→移除该列（其余列保留）。 */
export function toggleMultiSort(
  sorts: ReadonlyArray<{ key: string; dir: 'asc' | 'desc' }>,
  key: string,
): Array<{ key: string; dir: 'asc' | 'desc' }> {
  const current = sorts.find((sort) => sort.key === key)
  if (!current) return [...sorts, { key, dir: 'asc' }]
  if (current.dir === 'asc') return sorts.map((sort) => (sort.key === key ? { key, dir: 'desc' as const } : sort))
  return sorts.filter((sort) => sort.key !== key)
}

export function displayValue(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value)
}
