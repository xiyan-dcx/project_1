import type { AcceptanceResult, CaaSComparison, CaaSHealth } from '@/types/caas'

export function isScalaAfaBackend(health: CaaSHealth): boolean {
  const backend = health.storage_backend || ''
  return backend.includes('ScalaAFA afa0') && backend.includes('NVMe-oF') && backend.includes('local PV')
}

export function acceptanceChecks(acceptance: AcceptanceResult, comparison: CaaSComparison) {
  const localCv = comparison.local?.ops_per_sec_cv_percent
  const caasCv = comparison.caas?.ops_per_sec_cv_percent
  const maxCv = acceptance.max_cv_percent ?? 20
  return [
    { ok: acceptance.formal_run, label: `正式轮次不少于 ${acceptance.minimum_repeats ?? 3}` },
    { ok: acceptance.throughput_improved, label: '远程 compaction 中位吞吐高于本地' },
    { ok: acceptance.stable, label: `双方 CV ≤ ${maxCv}%（基线 ${numberText(localCv)}%，远程 ${numberText(caasCv)}%）` },
    { ok: acceptance.remote_path_exercised, label: `远程压缩实际触发（${comparison.caas?.remote_compactions ?? 0} 次）` },
    { ok: acceptance.dpp_online_verified, label: '在线 dPP 一致性与恢复门禁通过' },
  ]
}

export function numberText(value: number | null | undefined, digits = 1): string {
  return value == null || !Number.isFinite(value) ? '—' : value.toFixed(digits)
}
