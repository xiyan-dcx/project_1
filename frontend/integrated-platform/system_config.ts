// Non-secret defaults. This file can later import the platform's packages/config.
export const ENGINE_TARGET = '127.0.0.1'
export const ENGINE_PORT = 5001
export const TASK_POLL_INTERVAL = 2000

export function normalizeBasePath(value = '/'): string {
  const trimmed = value.trim()
  if (!/^\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]*\/?$/.test(trimmed)) {
    throw new Error('OMS_BASE_PATH must be a safe absolute URL path, for example /oms/')
  }
  return trimmed === '/' ? '/' : `${trimmed.replace(/\/$/, '')}/`
}
