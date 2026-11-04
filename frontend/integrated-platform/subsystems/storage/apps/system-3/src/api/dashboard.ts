import { apiBase, wsBase } from '@/config/endpoints'
import type { EngineDescriptor, EngineKey, RW, Sample } from '@/types/bench'
import { parseEngineCatalog } from '@/domain/dashboard'

export interface RunRequest {
  engine: EngineKey
  rw: RW
  bs: string
  qd: number
  rt: number
}

export interface RemoteStatus {
  source: string
  connected: boolean
  snapshot_stale: boolean
  last_message_at: number | null
  checked_at: number | null
  transport_error: string
  api_ok: boolean
  downstream_ok: boolean
  api_error: string
  downstream_error: string
  unsupported_samples: number
}

export interface DashboardHealth {
  ok: boolean
  state?: string
  message?: string
  engine_mode?: string
  run_enabled?: boolean
  run_enabled_reason?: string
  remote?: RemoteStatus
}

export async function health(): Promise<DashboardHealth> {
  const response = await fetch(`${apiBase}/health`)
  if (!response.ok) throw new Error(`健康检查失败：HTTP ${response.status}`)
  return response.json() as Promise<DashboardHealth>
}

export async function getEngines(): Promise<EngineDescriptor[]> {
  const response = await fetch(`${apiBase}/engines`)
  if (!response.ok) throw new Error(`引擎清单读取失败：HTTP ${response.status}`)
  return parseEngineCatalog(await response.json())
}

export async function runBenchmark(request: RunRequest) {
  const response = await fetch(`${apiBase}/run`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
  })
  if (!response.ok) throw new Error(`测试请求失败：HTTP ${response.status}`)
  return response.json() as Promise<{ ok: boolean; err?: string }>
}

export function connectDashboardSocket(onMessage: (message: Record<string, unknown>) => void) {
  const socket = new WebSocket(wsBase)
  socket.onmessage = (event) => onMessage(JSON.parse(event.data) as Record<string, unknown>)
  return socket
}

export function isSample(value: unknown): value is Sample {
  return Boolean(value && typeof value === 'object' && 'engine' in value && 'iops' in value)
}
