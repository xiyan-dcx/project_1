import { ENGINE_API_PATH } from '@research/config/system_config'
import type { ClusterNode, K8sSnapshot, K8sStreamEvent, Task } from '@/types/scheduler'

const DEFAULT_POD_LIMIT_PER_NODE = 200

/**
 * 默认走相对路径 /api/k8s，由 nginx 或 vite 开发代理转发，保持同源。
 * 本地 launchd 静态服务器不做转发，构建时用 VITE_ENGINE_API_BASE 传入引擎绝对地址。
 */
const API_BASE = (import.meta.env.VITE_ENGINE_API_BASE as string | undefined) || ENGINE_API_PATH

/** The shared engine path, exposed for the startup log. */
export function getEngineApiPath() {
  return API_BASE
}

function apiUrl(path: string) {
  return `${API_BASE.replace(/\/$/, '')}${path}`
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(apiUrl(path), {
    cache: 'no-store',
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      ...init?.headers,
    },
  })

  if (!response.ok) {
    const detail = await response.text()
    throw new Error(detail || `Kubernetes API request failed: ${response.status}`)
  }

  return response.json() as Promise<T>
}

export function fetchK8sSnapshot(podLimitPerNode = DEFAULT_POD_LIMIT_PER_NODE) {
  return requestJson<K8sSnapshot>(`/snapshot?podLimitPerNode=${podLimitPerNode}`)
}

export function createK8sBurst(count: number) {
  return requestJson<{ tasks?: Task[] }>('/tasks/burst', {
    method: 'POST',
    body: JSON.stringify({ count }),
  })
}

/**
 * Delete a pod this page created. The proxy refuses anything that does not carry
 * its managed label, so this cannot touch cluster workloads.
 */
export function deleteK8sPod(nodeId: string, taskId: string, confirmed: true) {
  return requestJson<{ nodes?: ClusterNode[] }>('/pods/delete', {
    method: 'POST',
    body: JSON.stringify({ nodeId, taskId, confirmed }),
  })
}

export function openK8sEventStream(onEvent: (event: K8sStreamEvent) => void, onError: () => void) {
  const source = new EventSource(apiUrl('/events?initial=false'))

  source.onmessage = (event) => {
    try {
      onEvent(JSON.parse(event.data) as K8sStreamEvent)
    } catch {
      onEvent({
        type: 'log',
        message: 'K8s 事件流返回了无法解析的消息',
        tone: 'error',
      })
    }
  }

  source.onerror = () => {
    onError()
  }

  return source
}
