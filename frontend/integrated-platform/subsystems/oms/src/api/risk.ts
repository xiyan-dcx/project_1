import type { EventRecord } from './types'

// Cluster risk index (0-100, higher is riskier). Each unresolved incident scores
// 100 × category × scope × confidence × recency; incidents combine like independent
// probabilities so several of them raise the index without ever passing 100.

export type RiskLevel = 'low' | 'attention' | 'high' | 'critical'

// Ordered like the Kubernetes scheduling guidance: evict > migrate > protect storage > check > review.
export const CATEGORY_WEIGHTS: Record<string, number> = {
  host_shutdown_or_poweroff: 1,
  host_network_partition_or_isolation: 0.9,
  storage_or_disk_failure: 0.8,
  service_process_failure: 0.6,
  config_or_env_misconfig: 0.4,
}
const UNKNOWN_CATEGORY_WEIGHT = 0.6

export const CONFIDENCE_WEIGHTS: Record<string, number> = { high: 1, medium: 0.8, low: 0.6 }
const UNKNOWN_CONFIDENCE_WEIGHT = 0.8

const FRESH_HOURS = 24
const HALF_LIFE_HOURS = 72
// Unresolved incidents never fade completely: someone still has to close them.
const RECENCY_FLOOR = 0.3
// Hosts that were only affected carry half the risk of the host where the fault started.
const IMPACTED_HOST_SHARE = 0.5
const HOUR = 3_600_000

export const RISK_LEVELS: Record<RiskLevel, { label: string; advice: string }> = {
  low: { label: '低', advice: '运行平稳，保持日常巡检。' },
  attention: { label: '关注', advice: '存在未恢复的问题，请安排人员跟进。' },
  high: { label: '高', advice: '故障风险较大，请尽快处理。' },
  critical: { label: '严重', advice: '多处严重故障未恢复，请立即处理。' },
}

export interface RiskFactors {
  category: number
  scope: number
  confidence: number
  recency: number
  impactedHosts: number
  totalHosts: number
}

export interface EventRisk {
  record: EventRecord
  score: number
  factors: RiskFactors
}

export interface ClusterRisk {
  score: number
  level: RiskLevel
  events: EventRisk[]
}

export interface HostRisk {
  hostIp: string
  score: number
  level: RiskLevel
  isPrimary: boolean
  topEvent: EventRecord | null
}

export interface RiskTrendPoint {
  at: Date
  score: number
}

export function riskLevel(score: number): RiskLevel {
  if (score >= 80) return 'critical'
  if (score >= 50) return 'high'
  if (score >= 20) return 'attention'
  return 'low'
}

/** Only real incidents from the main pipeline describe the live cluster; experiments do not. */
export function isProductionRecord(record: EventRecord): boolean {
  return record.suite === null && record.source === 'real'
}

function timestamp(value: string | null | undefined): number {
  return value ? new Date(value).getTime() : Number.NaN
}

export function isActiveAt(record: EventRecord, at: Date): boolean {
  const occurred = timestamp(record.occurred_at || record.generated_at)
  if (Number.isNaN(occurred) || occurred > at.getTime()) return false
  if (record.status !== 'resolved') return true
  // Resolved incidents still count for the moments before they were resolved.
  const resolved = timestamp(record.resolved_at)
  return !Number.isNaN(resolved) && resolved > at.getTime()
}

// Analyses of log lines that name no machine are filed under placeholders such as "unknown_host".
function isRealHost(hostIp: string): boolean {
  return Boolean(hostIp) && !hostIp.startsWith('unknown')
}

function analysedHostsOf(record: EventRecord): string[] {
  return record.hosts.map((host) => host.host_ip).filter(isRealHost)
}

export function impactedHostsOf(record: EventRecord): string[] {
  const hosts = new Set((record.impacted_hosts ?? []).filter(isRealHost))
  if (isRealHost(record.primary_failed_host)) hosts.add(record.primary_failed_host)
  return [...hosts]
}

export function riskFactors(record: EventRecord, at: Date): RiskFactors {
  const impacted = impactedHostsOf(record)
  const totalHosts = new Set([...analysedHostsOf(record), ...impacted]).size
  // Unknown reach counts as half the cluster.
  const reach = impacted.length === 0 || totalHosts === 0 ? 0.5 : impacted.length / totalHosts
  const ageHours = (at.getTime() - timestamp(record.occurred_at || record.generated_at)) / HOUR
  const recency = ageHours <= FRESH_HOURS
    ? 1
    : Math.max(RECENCY_FLOOR, 0.5 ** ((ageHours - FRESH_HOURS) / HALF_LIFE_HOURS))
  return {
    category: CATEGORY_WEIGHTS[record.root_cause_category] ?? UNKNOWN_CATEGORY_WEIGHT,
    scope: 0.5 + 0.5 * reach,
    confidence: CONFIDENCE_WEIGHTS[(record.confidence || '').toLowerCase()] ?? UNKNOWN_CONFIDENCE_WEIGHT,
    recency,
    impactedHosts: impacted.length,
    totalHosts,
  }
}

export function eventRisk(record: EventRecord, at: Date): EventRisk | null {
  if (!isActiveAt(record, at)) return null
  const factors = riskFactors(record, at)
  return { record, factors, score: 100 * factors.category * factors.scope * factors.confidence * factors.recency }
}

function combine(scores: number[]): number {
  return 100 * (1 - scores.reduce((remaining, score) => remaining * (1 - score / 100), 1))
}

export function clusterRisk(records: EventRecord[], at: Date): ClusterRisk {
  const events = records
    .map((record) => eventRisk(record, at))
    .filter((risk): risk is EventRisk => risk !== null)
    .sort((first, second) => second.score - first.score)
  const score = Math.round(combine(events.map((risk) => risk.score)))
  return { score, level: riskLevel(score), events }
}

/** Every host named by a record, ranked by its own risk; hosts without active incidents score 0. */
export function hostRisks(records: EventRecord[], at: Date): HostRisk[] {
  type Share = { score: number; record: EventRecord; isPrimary: boolean }
  const shares = new Map<string, { scores: number[]; top: Share | null }>()
  const entry = (hostIp: string) => {
    let current = shares.get(hostIp)
    if (!current) { current = { scores: [], top: null }; shares.set(hostIp, current) }
    return current
  }
  for (const record of records) {
    for (const hostIp of analysedHostsOf(record)) entry(hostIp)
    const risk = eventRisk(record, at)
    if (!risk) continue
    for (const hostIp of impactedHostsOf(record)) {
      const isPrimary = hostIp === record.primary_failed_host
      const share = risk.score * (isPrimary ? 1 : IMPACTED_HOST_SHARE)
      const current = entry(hostIp)
      current.scores.push(share)
      // The host's role and summary come from the incident that weighs most on this host.
      if (!current.top || share > current.top.score) current.top = { score: share, record, isPrimary }
    }
  }
  return [...shares.entries()]
    .map(([hostIp, current]) => {
      const score = Math.round(combine(current.scores))
      return {
        hostIp, score, level: riskLevel(score),
        isPrimary: current.top?.isPrimary ?? false, topEvent: current.top?.record ?? null,
      }
    })
    .sort((first, second) => second.score - first.score || first.hostIp.localeCompare(second.hostIp))
}

/** Index at the end of each of the last `days` days, with the current value as the final point. */
export function riskTrend(records: EventRecord[], now: Date, days = 7): RiskTrendPoint[] {
  return Array.from({ length: days }, (_, index) => {
    const offset = days - 1 - index
    const at = offset === 0
      ? now
      : new Date(new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset + 1).getTime() - 1)
    return { at, score: clusterRisk(records, at).score }
  })
}
