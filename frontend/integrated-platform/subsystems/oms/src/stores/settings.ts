import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { requestJson } from '../api/client'

export type SettingsModel = 'deepseek-chat' | 'qwen-4bit' | 'qwen-8bit' | 'custom'

export interface SettingsDraft {
  selected_model: SettingsModel
  deepseek_api_key: string
  deepseek_base_url: string
  deepseek_model: string
  qwen_4bit_url: string
  qwen_8bit_url: string
  custom_endpoint: string
  custom_model_name: string
  custom_api_key: string
}

export interface SettingsModelDefinition {
  value: SettingsModel
  label: string
  serviceLabel: string
  endpointField: 'deepseek_base_url' | 'qwen_4bit_url' | 'qwen_8bit_url' | 'custom_endpoint'
  modelField?: 'deepseek_model' | 'custom_model_name'
  apiKeyField?: 'deepseek_api_key' | 'custom_api_key'
}

export const settingsModels: readonly SettingsModelDefinition[] = [
  {
    value: 'deepseek-chat', label: 'DeepSeek', serviceLabel: '云端服务',
    endpointField: 'deepseek_base_url', modelField: 'deepseek_model', apiKeyField: 'deepseek_api_key',
  },
  {
    value: 'qwen-4bit', label: 'Qwen 4-bit', serviceLabel: '本地服务',
    endpointField: 'qwen_4bit_url',
  },
  {
    value: 'qwen-8bit', label: 'Qwen 8-bit', serviceLabel: '本地服务',
    endpointField: 'qwen_8bit_url',
  },
  {
    value: 'custom', label: '自定义模型', serviceLabel: 'OpenAI-compatible',
    endpointField: 'custom_endpoint', modelField: 'custom_model_name', apiKeyField: 'custom_api_key',
  },
]

export function getSettingsModelConfiguration(settings: SettingsDraft, model: SettingsModel) {
  const definition = settingsModels.find((candidate) => candidate.value === model)
  if (!definition) throw new Error('Unsupported settings model')
  return {
    endpoint: settings[definition.endpointField],
    modelName: definition.modelField ? settings[definition.modelField] : 'Qwen/Qwen2.5-7B-Instruct',
    apiKey: definition.apiKeyField ? settings[definition.apiKeyField] : 'EMPTY',
  }
}

interface SettingsResponse {
  status: string
  env: Partial<Record<
    | 'DEEPSEEK_API_KEY'
    | 'DEEPSEEK_BASE_URL'
    | 'DEEPSEEK_MODEL'
    | 'QWEN_4BIT_OPENAI_BASE_URL'
    | 'QWEN_8BIT_OPENAI_BASE_URL'
    | 'CUSTOM_OPENAI_BASE_URL'
    | 'CUSTOM_MODEL_NAME'
    | 'CUSTOM_API_KEY',
    string
  >>
  model: Partial<Pick<SettingsDraft,
    'selected_model' | 'custom_endpoint' | 'custom_model_name' | 'custom_api_key'
  >>
}

export function createDefaultSettings(): SettingsDraft {
  return {
    selected_model: 'deepseek-chat',
    deepseek_api_key: '',
    deepseek_base_url: 'https://api.deepseek.com',
    deepseek_model: 'deepseek-chat',
    qwen_4bit_url: 'http://127.0.0.1:8001/v1',
    qwen_8bit_url: 'http://127.0.0.1:8002/v1',
    custom_endpoint: 'http://localhost:8000/v1',
    custom_model_name: 'Qwen/Qwen2.5-7B-Instruct',
    custom_api_key: 'EMPTY',
  }
}

const modelValues: readonly string[] = settingsModels.map((model) => model.value)
const endpointFields = [
  ['deepseek_base_url', 'DeepSeek Base URL'],
  ['qwen_4bit_url', 'Qwen 4-bit URL'],
  ['qwen_8bit_url', 'Qwen 8-bit URL'],
  ['custom_endpoint', '自定义 Base URL'],
] as const

export function isSafeSettingsUrl(value: string): boolean {
  try {
    const endpoint = new URL(value)
    return /^https?:\/\//i.test(value)
      && ['http:', 'https:'].includes(endpoint.protocol)
      && Boolean(endpoint.hostname)
      && !endpoint.username
      && !endpoint.password
      && !endpoint.search
      && !endpoint.hash
      && !/[\s\\]/.test(value)
      && !value.includes('?')
      && !value.includes('#')
  } catch {
    return false
  }
}

function containsInvalidConfigCharacters(value: string): boolean {
  return value.includes('\r') || value.includes('\n') || value.includes('\u0000')
}

export function getSettingsValidationMessage(settings: SettingsDraft): string {
  if (!modelValues.includes(settings.selected_model)) return '请选择支持的推理模型。'
  for (const [field, label] of endpointFields) {
    if (settings[field] !== '' && !isSafeSettingsUrl(settings[field])) {
      return `${label} 必须是完整的 HTTP(S) 地址，不能包含账号、密码、查询参数或片段。`
    }
  }
  if (Object.values(settings).some(containsInvalidConfigCharacters)) {
    return '配置值不能包含换行或空字符。'
  }
  return ''
}

function mapSettingsResponse(response: SettingsResponse): SettingsDraft {
  if (response.status !== 'success' || !response.env || !response.model) {
    throw new Error('Invalid settings response')
  }
  const defaults = createDefaultSettings()
  const environment = response.env
  const model = response.model
  // Nullish fallbacks preserve explicitly cleared values from the backend.
  const settings: SettingsDraft = {
    selected_model: model.selected_model ?? defaults.selected_model,
    deepseek_api_key: environment.DEEPSEEK_API_KEY ?? defaults.deepseek_api_key,
    deepseek_base_url: environment.DEEPSEEK_BASE_URL ?? defaults.deepseek_base_url,
    deepseek_model: environment.DEEPSEEK_MODEL ?? defaults.deepseek_model,
    qwen_4bit_url: environment.QWEN_4BIT_OPENAI_BASE_URL ?? defaults.qwen_4bit_url,
    qwen_8bit_url: environment.QWEN_8BIT_OPENAI_BASE_URL ?? defaults.qwen_8bit_url,
    custom_endpoint: model.custom_endpoint ?? environment.CUSTOM_OPENAI_BASE_URL ?? defaults.custom_endpoint,
    custom_model_name: model.custom_model_name ?? environment.CUSTOM_MODEL_NAME ?? defaults.custom_model_name,
    custom_api_key: model.custom_api_key ?? environment.CUSTOM_API_KEY ?? defaults.custom_api_key,
  }
  if (!modelValues.includes(settings.selected_model)
    || Object.values(settings).some((value) => typeof value !== 'string')) {
    throw new Error('Invalid settings values')
  }
  return settings
}

export const useSettingsStore = defineStore('settings', () => {
  const draft = ref<SettingsDraft>(createDefaultSettings())
  const savedSettings = ref<SettingsDraft | null>(null)
  const loading = ref(false)
  const saving = ref(false)
  const testing = ref(false)
  const loadError = ref('')
  const saveError = ref('')
  const saveMessage = ref('')
  const testMessage = ref('')
  const testModel = ref<SettingsModel | null>(null)
  let testController: AbortController | null = null

  const loaded = computed(() => savedSettings.value !== null)
  const dirty = computed(() => savedSettings.value !== null
    && (Object.keys(draft.value) as Array<keyof SettingsDraft>)
      .some((field) => draft.value[field] !== savedSettings.value?.[field]))
  const busy = computed(() => loading.value || saving.value || testing.value)

  async function loadSettings(): Promise<void> {
    if (busy.value) return
    loading.value = true
    loadError.value = ''
    saveError.value = ''
    saveMessage.value = ''
    testMessage.value = ''
    testModel.value = null
    try {
      const response = await requestJson<SettingsResponse>('/api/config', { cache: 'no-store' })
      const settings = mapSettingsResponse(response)
      savedSettings.value = { ...settings }
      draft.value = { ...settings }
    } catch {
      // Never render raw server/network errors: they can contain URLs or secrets.
      loadError.value = '无法读取后端配置。请检查服务连接后重试；尚未修改服务器设置。'
    } finally {
      loading.value = false
    }
  }

  async function saveSettings(): Promise<void> {
    if (!loaded.value || busy.value || loadError.value) return
    saveMessage.value = ''
    const payload = { ...draft.value }
    saveError.value = getSettingsValidationMessage(payload)
    if (saveError.value) return
    saving.value = true
    try {
      const response = await requestJson<{ status: string }>('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (response.status !== 'success') throw new Error('Settings save rejected')
      savedSettings.value = payload
      saveMessage.value = '配置已保存到后端。连接是否可用请单独测试。'
    } catch {
      saveError.value = '保存未获确认，草稿已保留。请检查连接后重试保存。'
    } finally {
      saving.value = false
    }
  }

  function resetDraft(): void {
    if (!loaded.value || busy.value || loadError.value) return
    draft.value = createDefaultSettings()
    saveError.value = ''
    testMessage.value = ''
    testModel.value = null
    saveMessage.value = '表单已重置为默认值，尚未保存。点击“保存配置”后才会修改后端。'
  }

  function restoreDraft(): void {
    if (!savedSettings.value || busy.value || loadError.value) return
    draft.value = { ...savedSettings.value }
    saveError.value = ''
    testMessage.value = ''
    testModel.value = null
    saveMessage.value = '已放弃未保存的修改，恢复为最近一次读取或保存的配置。'
  }

  function cancelConnectionTest(): void {
    testController?.abort()
    testController = null
    testing.value = false
    testMessage.value = ''
    testModel.value = null
  }

  async function testConnection(model: SettingsModel = draft.value.selected_model): Promise<void> {
    if (!loaded.value || busy.value || loadError.value) return
    const settings = { ...draft.value }
    testModel.value = model
    if (!modelValues.includes(model)) {
      testMessage.value = '请选择支持的推理模型。'
      return
    }
    const connection = getSettingsModelConfiguration(settings, model)
    if (!isSafeSettingsUrl(connection.endpoint)) {
      testMessage.value = '请先填写待测试模型的有效 HTTP(S) 地址，且不包含凭据、查询参数或片段。'
      return
    }
    if (containsInvalidConfigCharacters(connection.apiKey)) {
      testMessage.value = 'API Key 不能包含换行或空字符。'
      return
    }
    const controller = new AbortController()
    testController = controller
    testing.value = true
    testMessage.value = '正在请求当前草稿地址的 /models，最多等待 10 秒。'
    const timeout = setTimeout(() => controller.abort(), 10_000)
    try {
      const headers: Record<string, string> = {}
      if (connection.apiKey) headers.Authorization = `Bearer ${connection.apiKey}`
      const response = await fetch(`${connection.endpoint.replace(/\/+$/, '')}/models`, {
        method: 'GET',
        headers,
        signal: controller.signal,
        credentials: 'omit',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
        cache: 'no-store',
      })
      if (testController !== controller) return
      testMessage.value = response.ok
        ? '/models 请求成功。这只验证浏览器连接，不代表推理可用，也未保存配置。'
        : `连接测试失败（HTTP ${response.status}）。请检查端点与访问权限。`
    } catch {
      if (testController !== controller) return
      testMessage.value = controller.signal.aborted
        ? '连接测试已超时（10 秒）。请确认模型服务正在运行后重试。'
        : '浏览器无法访问模型服务。请检查网络、CORS、HTTPS 混合内容限制或端点重定向。'
    } finally {
      clearTimeout(timeout)
      if (testController === controller) {
        testController = null
        testing.value = false
      }
    }
  }

  return {
    draft, loaded, dirty, busy, loading, saving, testing,
    loadError, saveError, saveMessage, testMessage, testModel,
    loadSettings, saveSettings, resetDraft, restoreDraft, testConnection, cancelConnectionTest,
  }
})
