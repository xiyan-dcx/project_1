import type { EventRecord } from './types'
import { formatLabel } from './labels'

function escapeCell(value: unknown): string {
  const text = String(value ?? '')
  // Spreadsheet applications may execute formulas even in quoted CSV cells.
  const safe = /^[\s]*[=+@-]|^[\t\r\n]/.test(text) ? `'${text}` : text
  return `"${safe.replaceAll('"', '""')}"`
}

export function createEventsCsv(records: EventRecord[]): string {
  const rows: unknown[][] = [['事件 ID', '来源', '实验套件', '运行批次', '主故障主机', '根因类别', '置信度', '诊断时间', '摘要']]
  for (const record of records) rows.push([
    record.event_id, formatLabel(record.source), record.suite, record.run_id,
    record.primary_failed_host, formatLabel(record.root_cause_category),
    formatLabel(record.confidence), record.generated_at, record.summary,
  ])
  return '\uFEFF' + rows.map((row) => row.map(escapeCell).join(',')).join('\r\n')
}

export function downloadEventsCsv(records: EventRecord[]) {
  const url = URL.createObjectURL(new Blob([createEventsCsv(records)], { type: 'text/csv;charset=utf-8;' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `oms-events-${new Date().toISOString().replaceAll(':', '-')}.csv`
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
