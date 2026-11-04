import { describe, expect, it } from 'vitest'
import { createEventsCsv } from './csv'
import type { EventRecord } from './types'

describe('event CSV export', () => {
  it('preserves multiline quotes and neutralizes spreadsheet formulas', () => {
    const record = {
      event_id: '=HYPERLINK("example")', source: 'real', suite: null, run_id: null,
      summary: 'first,"quoted"\nsecond', primary_failed_host: '10.0.0.1',
      root_cause_category: 'unknown', confidence: 'high', generated_at: '',
    } as EventRecord
    const csv = createEventsCsv([record])
    expect(csv.startsWith('\uFEFF')).toBe(true)
    expect(csv).toContain('"\'=HYPERLINK(""example"")"')
    expect(csv).toContain('"first,""quoted""\nsecond"')
  })
})
