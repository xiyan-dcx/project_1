import { API_BASE_URL } from '@/constants/inference'

export function apiUrl(path: string): string {
  return `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`
}

export async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(apiUrl(path), init)
  if (!response.ok) {
    const detail = await response.text()
    throw new Error(detail || `请求失败：HTTP ${response.status}`)
  }
  return response.json() as Promise<T>
}
