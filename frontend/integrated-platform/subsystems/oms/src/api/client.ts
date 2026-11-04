export class ApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message)
    this.name = 'ApiError'
  }
}

async function request(path: string, options: RequestInit = {}): Promise<Response> {
  if (!path.startsWith('/') || path.startsWith('//')) {
    throw new Error('请求地址必须是本站路径')
  }
  const headers = new Headers(options.headers)
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const response = await fetch(path, { cache: 'no-store', ...options, headers })
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null)
    const message = body && typeof body === 'object' && 'message' in body
      ? String(body.message)
      : `请求失败（HTTP ${response.status}）`
    throw new ApiError(message, response.status)
  }
  return response
}

export async function requestJson<ResponseBody>(path: string, options?: RequestInit): Promise<ResponseBody> {
  const response = await request(path, options)
  if (!response.headers.get('content-type')?.includes('application/json')) {
    throw new Error('服务器未返回 JSON 数据，请检查接口配置')
  }
  return response.json() as Promise<ResponseBody>
}

export async function requestText(path: string, options?: RequestInit): Promise<string> {
  const response = await request(path, options)
  if (response.headers.get('content-type')?.includes('text/html')) {
    throw new Error('报告文件缺失或服务器错误返回了页面')
  }
  return response.text()
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '操作失败，请重试'
}
