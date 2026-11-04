import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { requestJson } from '../api/client'
import { isSafeSettingsUrl, useSettingsStore } from './settings'

vi.mock('../api/client', () => ({ requestJson: vi.fn() }))

const requestMock = vi.mocked(requestJson)
const fetchMock = vi.fn<typeof fetch>()

function createResponse() {
  return {
    status: 'success',
    env: {
      DEEPSEEK_API_KEY: 'test-secret',
      DEEPSEEK_BASE_URL: 'https://api.example.test/v1',
      DEEPSEEK_MODEL: 'deepseek-chat',
      CUSTOM_API_KEY: 'environment-fallback',
    },
    model: { selected_model: 'deepseek-chat', custom_api_key: '' },
  }
}

beforeEach(() => {
  setActivePinia(createPinia())
  requestMock.mockReset()
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('settings backend and draft contract', () => {
  it('loads server values and preserves explicit empty overrides', async () => {
    requestMock.mockResolvedValueOnce(createResponse())
    const store = useSettingsStore()
    await store.loadSettings()
    expect(requestMock).toHaveBeenCalledWith('/api/config', { cache: 'no-store' })
    expect(store.draft.deepseek_api_key).toBe('test-secret')
    expect(store.draft.custom_api_key).toBe('')
    expect(store.loaded).toBe(true)
    expect(store.dirty).toBe(false)
  })

  it('keeps reset local until an explicit save posts all flat fields', async () => {
    requestMock.mockResolvedValueOnce(createResponse()).mockResolvedValueOnce({ status: 'success' })
    const store = useSettingsStore()
    await store.loadSettings()
    store.resetDraft()
    expect(requestMock).toHaveBeenCalledTimes(1)
    expect(store.draft.deepseek_api_key).toBe('')
    expect(store.dirty).toBe(true)
    store.draft.custom_endpoint = ''
    store.draft.custom_api_key = ''
    await store.saveSettings()
    const payload = JSON.parse(String(requestMock.mock.calls[1]?.[1]?.body))
    expect(payload).toEqual({ ...store.draft })
    expect(payload.custom_endpoint).toBe('')
    expect(payload.deepseek_api_key).toBe('')
    expect(store.dirty).toBe(false)
  })

  it('retains failed saves without displaying secret-bearing errors', async () => {
    requestMock.mockResolvedValueOnce(createResponse()).mockRejectedValueOnce(new Error('test-secret'))
    const store = useSettingsStore()
    await store.loadSettings()
    store.draft.deepseek_model = 'changed-model'
    await store.saveSettings()
    expect(store.draft.deepseek_model).toBe('changed-model')
    expect(store.dirty).toBe(true)
    expect(store.saveError).not.toContain('test-secret')
    expect(store.saveError).not.toBe('')
    expect(store.saving).toBe(false)
  })

  it('discards all model edits locally without mutating the saved snapshot', async () => {
    requestMock.mockResolvedValueOnce(createResponse())
    const store = useSettingsStore()
    await store.loadSettings()
    const savedDraft = { ...store.draft }
    store.draft.selected_model = 'qwen-8bit'
    store.draft.deepseek_api_key = ''
    store.draft.qwen_8bit_url = 'https://draft.example.test/v1'
    store.restoreDraft()
    expect(store.draft).toEqual(savedDraft)
    expect(store.dirty).toBe(false)
    expect(requestMock).toHaveBeenCalledTimes(1)
    store.draft.deepseek_model = 'another-edit'
    store.restoreDraft()
    expect(store.draft).toEqual(savedDraft)
  })

  it('exposes a retryable load failure and recovers from a subsequent read', async () => {
    requestMock.mockRejectedValueOnce(new Error('private details')).mockResolvedValueOnce(createResponse())
    const store = useSettingsStore()
    await store.loadSettings()
    expect(store.loaded).toBe(false)
    expect(store.loadError).not.toContain('private details')
    await store.saveSettings()
    expect(requestMock).toHaveBeenCalledTimes(1)
    await store.loadSettings()
    expect(store.loaded).toBe(true)
    expect(store.loadError).toBe('')
  })

  it.each([
    'javascript:alert(1)',
    'ftp://example.test',
    'https://user:password@example.test/v1',
    'https://example.test/v1?api_key=secret',
    'https://example.test/v1#secret',
    '/relative/path',
    'https://example.test/\nsecret',
  ])('rejects an unsafe endpoint without submitting it: %s', async (endpoint) => {
    expect(isSafeSettingsUrl(endpoint)).toBe(false)
    requestMock.mockResolvedValueOnce(createResponse())
    const store = useSettingsStore()
    await store.loadSettings()
    store.draft.deepseek_base_url = endpoint
    await store.saveSettings()
    await store.testConnection()
    expect(requestMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(store.saveError).not.toBe('')
  })

  it.each(['\r', '\n', '\u0000'])('blocks forbidden credential character %j before saving or testing', async (character) => {
    requestMock.mockResolvedValueOnce(createResponse())
    const store = useSettingsStore()
    await store.loadSettings()
    store.draft.deepseek_api_key = `test${character}secret`
    await store.saveSettings()
    await store.testConnection()
    expect(requestMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(store.saveError).toContain('换行或空字符')
    expect(store.testMessage).toContain('换行或空字符')
  })

  it('tests the unsaved endpoint with Bearer auth but never saves it', async () => {
    requestMock.mockResolvedValueOnce(createResponse())
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }))
    const store = useSettingsStore()
    await store.loadSettings()
    store.draft.deepseek_base_url = 'https://draft.example.test/v1/'
    await store.testConnection()
    expect(fetchMock).toHaveBeenCalledWith('https://draft.example.test/v1/models', expect.objectContaining({
      method: 'GET',
      headers: { Authorization: 'Bearer test-secret' },
      credentials: 'omit',
      redirect: 'error',
      signal: expect.any(AbortSignal),
    }))
    expect(requestMock).toHaveBeenCalledTimes(1)
    expect(store.dirty).toBe(true)
    expect(store.testMessage).toContain('不代表推理可用')
  })

  it.each([
    { model: 'qwen-4bit', endpoint: 'http://127.0.0.1:8001/v1', apiKey: 'EMPTY' },
    { model: 'qwen-8bit', endpoint: 'http://127.0.0.1:8002/v1', apiKey: 'EMPTY' },
    { model: 'custom', endpoint: 'http://localhost:8000/v1', apiKey: 'custom-test-secret' },
  ] as const)('tests the $model row without selecting or saving it', async ({ model, endpoint, apiKey }) => {
    requestMock.mockResolvedValueOnce(createResponse())
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }))
    const store = useSettingsStore()
    await store.loadSettings()
    store.draft.custom_api_key = 'custom-test-secret'
    const draftBeforeTest = { ...store.draft }
    await store.testConnection(model)
    expect(fetchMock).toHaveBeenCalledWith(`${endpoint}/models`, expect.objectContaining({
      headers: { Authorization: `Bearer ${apiKey}` },
    }))
    expect(store.draft).toEqual(draftBeforeTest)
    expect(store.testModel).toBe(model)
    expect(requestMock).toHaveBeenCalledTimes(1)
  })

  it('ignores a cancelled row test when a newer row result has completed', async () => {
    requestMock.mockResolvedValueOnce(createResponse())
    let resolveCancelledRequest: ((response: Response) => void) | undefined
    fetchMock.mockImplementationOnce(() => new Promise((resolve) => { resolveCancelledRequest = resolve }))
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 403 }))
    const store = useSettingsStore()
    await store.loadSettings()
    const cancelledTest = store.testConnection('deepseek-chat')
    store.cancelConnectionTest()
    await store.testConnection('qwen-4bit')
    resolveCancelledRequest?.(new Response(null, { status: 200 }))
    await cancelledTest
    expect(store.testModel).toBe('qwen-4bit')
    expect(store.testMessage).toContain('HTTP 403')
    expect(store.testing).toBe(false)
  })

  it('aborts a stalled browser connection test after ten seconds', async () => {
    vi.useFakeTimers()
    requestMock.mockResolvedValueOnce(createResponse())
    fetchMock.mockImplementation((_input, options) => new Promise((_resolve, reject) => {
      options?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
    }))
    const store = useSettingsStore()
    await store.loadSettings()
    const pendingTest = store.testConnection()
    expect(store.testing).toBe(true)
    await vi.advanceTimersByTimeAsync(10_000)
    await pendingTest
    expect(store.testing).toBe(false)
    expect(store.testMessage).toContain('超时')
  })
})
