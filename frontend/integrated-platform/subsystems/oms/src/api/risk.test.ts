import { describe, expect, it } from 'vitest'
import {
  clusterRisk, eventRisk, hostRisks, isActiveAt, isProductionRecord, riskFactors, riskLevel, riskTrend,
} from './risk'
import type { EventRecord } from './types'

const NOW = new Date('2026-10-22T12:00:00')

function hoursBefore(hours: number, from = NOW): string {
  return new Date(from.getTime() - hours * 3_600_000).toISOString()
}

function record(overrides: Partial<EventRecord> = {}): EventRecord {
  return {
    record_id: 'record', event_id: 'event', source: 'real', suite: null, run_id: null,
    generated_at: hoursBefore(1), occurred_at: hoursBefore(2), occurred_at_estimated: false,
    primary_failed_host: '10.0.3.13', root_cause_category: 'host_shutdown_or_poweroff', confidence: 'high',
    overall_severity: 'high', summary: '', diagnosis_url: '/diagnosis.json', report_url: null,
    hosts: ['10.0.3.12', '10.0.3.13', '10.0.3.14'].map((host_ip) => ({ host_ip, analysis_url: '' })),
    impacted_hosts: ['10.0.3.12', '10.0.3.13', '10.0.3.14'],
    status: 'open', status_updated_at: null, resolved_at: null,
    capabilities: { delete: true, diagnose: true, scheduling: true, status: true },
    ...overrides,
  }
}

describe('risk index', () => {
  it('gives a fresh, cluster-wide, confident power loss the full score', () => {
    expect(eventRisk(record(), NOW)?.score).toBeCloseTo(100)
  })

  it('weights category, reach and confidence as documented', () => {
    const factors = riskFactors(record({
      root_cause_category: 'config_or_env_misconfig', confidence: 'medium', impacted_hosts: ['10.0.3.13'],
    }), NOW)
    expect(factors).toMatchObject({ category: 0.4, confidence: 0.8, impactedHosts: 1, totalHosts: 3 })
    expect(factors.scope).toBeCloseTo(0.5 + 0.5 / 3)
    // Unknown categories, confidence and reach fall back to middle values.
    expect(riskFactors(record({
      root_cause_category: 'something_new', confidence: '', primary_failed_host: '', impacted_hosts: [],
    }), NOW)).toMatchObject({ category: 0.6, confidence: 0.8, scope: 0.75 })
  })

  it('keeps risk for a day, halves it every three days after, and never drops below 0.3', () => {
    expect(riskFactors(record({ occurred_at: hoursBefore(23) }), NOW).recency).toBe(1)
    expect(riskFactors(record({ occurred_at: hoursBefore(24 + 72) }), NOW).recency).toBeCloseTo(0.5)
    expect(riskFactors(record({ occurred_at: hoursBefore(24 * 200) }), NOW).recency).toBe(0.3)
  })

  it('counts an incident only between its occurrence and its recovery', () => {
    const resolved = record({ status: 'resolved', resolved_at: hoursBefore(1) })
    expect(isActiveAt(resolved, NOW)).toBe(false)
    expect(isActiveAt(resolved, new Date(NOW.getTime() - 90 * 60_000))).toBe(true)
    expect(isActiveAt(record({ occurred_at: hoursBefore(-1) }), NOW)).toBe(false)
    expect(isActiveAt(record({ status: 'acknowledged' }), NOW)).toBe(true)
    expect(isActiveAt(record({ status: 'resolved', resolved_at: null }), NOW)).toBe(false)
    expect(eventRisk(resolved, NOW)).toBeNull()
  })

  it('combines incidents without exceeding 100 and ranks them', () => {
    const half = { root_cause_category: 'host_shutdown_or_poweroff', occurred_at: hoursBefore(24 + 72) }
    const risk = clusterRisk([
      record({ ...half, record_id: 'a' }),
      record({ ...half, record_id: 'b', confidence: 'low' }),
    ], NOW)
    expect(risk.score).toBe(Math.round(100 * (1 - 0.5 * 0.7)))
    expect(risk.events.map((event) => event.record.record_id)).toEqual(['a', 'b'])
    expect(clusterRisk([record(), record({ record_id: 'second' })], NOW).score).toBe(100)
    expect(clusterRisk([], NOW)).toEqual({ score: 0, level: 'low', events: [] })
  })

  it('maps scores to the four levels at their boundaries', () => {
    expect([0, 19, 20, 49, 50, 79, 80, 100].map(riskLevel)).toEqual(
      ['low', 'low', 'attention', 'attention', 'high', 'high', 'critical', 'critical'])
  })

  it('rates the primary host fully, affected hosts at half, and untouched hosts at zero', () => {
    // Two of three hosts affected: the incident scores 100 × (0.5 + 0.5 × 2/3) ≈ 83.
    const hosts = hostRisks([record({ impacted_hosts: ['10.0.3.12'] })], NOW)
    expect(hosts.map(({ hostIp, score, isPrimary }) => [hostIp, score, isPrimary])).toEqual([
      ['10.0.3.13', 83, true], ['10.0.3.12', 42, false], ['10.0.3.14', 0, false],
    ])
    expect(hosts[0].topEvent?.record_id).toBe('record')
    expect(hosts[2]).toMatchObject({ level: 'low', topEvent: null })
  })

  it('takes a host role from the incident that weighs most on it and skips placeholder hosts', () => {
    const hosts = hostRisks([
      // 10.0.3.12 starts a mild configuration issue but is also hit by a power loss elsewhere.
      record({ record_id: 'config', primary_failed_host: '10.0.3.12', root_cause_category: 'config_or_env_misconfig',
        impacted_hosts: ['10.0.3.12'] }),
      record({ record_id: 'power', primary_failed_host: '10.0.3.13',
        hosts: [...record().hosts, { host_ip: 'unknown_host', analysis_url: '' }],
        impacted_hosts: ['10.0.3.12', '10.0.3.13', '10.0.3.14', 'unknown_host'] }),
    ], NOW)
    const host = hosts.find((item) => item.hostIp === '10.0.3.12')
    expect(host).toMatchObject({ isPrimary: false, topEvent: { record_id: 'power' } })
    expect(hosts.map((item) => item.hostIp)).not.toContain('unknown_host')
    expect(riskFactors(record({ hosts: [{ host_ip: 'unknown_host', analysis_url: '' }, ...record().hosts] }), NOW).totalHosts).toBe(3)
  })

  it('reports seven daily points that fall after an incident is resolved', () => {
    const occurred = new Date('2026-10-18T09:00:00')
    const resolvedAt = new Date('2026-10-20T15:00:00')
    const trend = riskTrend([record({
      occurred_at: occurred.toISOString(), status: 'resolved', resolved_at: resolvedAt.toISOString(),
    })], NOW)
    expect(trend).toHaveLength(7)
    expect(trend[6].at).toBe(NOW)
    expect(trend[0].at.getDate()).toBe(16)
    expect(trend.map((point) => point.score > 0)).toEqual([false, false, true, true, false, false, false])
  })

  it('treats only real main-pipeline records as production incidents', () => {
    expect(isProductionRecord(record())).toBe(true)
    expect(isProductionRecord(record({ source: 'mock' }))).toBe(false)
    expect(isProductionRecord(record({ suite: 'E1', run_id: 'run' }))).toBe(false)
  })
})
