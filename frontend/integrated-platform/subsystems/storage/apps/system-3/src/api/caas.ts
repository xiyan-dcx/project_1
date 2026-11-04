import { apiBase } from '@/config/endpoints'
import type { CaaSHealth, CaaSJob, CaaSRunRequest } from '@/types/caas'

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 12000)
  try {
    const response = await fetch(`${apiBase}${path}`, { ...init, signal: controller.signal })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const value: unknown = await response.json()
    if (!value || typeof value !== 'object') throw new Error('接口返回格式错误')
    return value as T
  } finally {
    clearTimeout(timeout)
  }
}

export async function getCaaSHealth(): Promise<CaaSHealth> {
  return requestJson<CaaSHealth>('/caas/health')
}

export async function startCaaSRun(request: CaaSRunRequest): Promise<string> {
  const result = await requestJson<{ job_id?: string; error?: string; detail?: string }>('/caas/run', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
  })
  if (!result.job_id || !/^compare-[0-9a-f]{32}$/.test(result.job_id)) {
    throw new Error(result.error || result.detail || '服务器未返回有效任务编号')
  }
  return result.job_id
}

export async function getCaaSRun(jobId: string): Promise<CaaSJob> {
  if (!/^compare-[0-9a-f]{32}$/.test(jobId)) throw new Error('任务编号无效')
  const result = await requestJson<CaaSJob>(`/caas/run/${jobId}`)
  if (typeof result.state !== 'string') throw new Error('任务状态格式错误')
  return result
}
