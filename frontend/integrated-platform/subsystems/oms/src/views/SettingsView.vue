<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { ElButton } from 'element-plus'
import ModelSettingsDialog from '../components/ModelSettingsDialog.vue'
import {
  getSettingsModelConfiguration, settingsModels, useSettingsStore,
  type SettingsDraft, type SettingsModelDefinition,
} from '../stores/settings'

const settingsStore = useSettingsStore()
const {
  draft, loaded, dirty, busy, loading, saving, testing,
  loadError, saveError, saveMessage, testMessage, testModel,
} = storeToRefs(settingsStore)
const confirmationAction = ref<'discard' | 'defaults' | null>(null)
const editorVisible = ref(false)
const editingDefinition = ref<SettingsModelDefinition | null>(null)
const formDisabled = computed(() => busy.value || !loaded.value || Boolean(loadError.value))
const modelRows = computed(() => settingsModels.map((definition) => {
  const { endpoint, modelName } = getSettingsModelConfiguration(draft.value, definition.value)
  const hasKey = definition.apiKeyField ? Boolean(draft.value[definition.apiKeyField]) : true
  return {
    ...definition,
    endpoint,
    modelName,
    hasKey,
    credentialLabel: definition.apiKeyField
      ? (draft.value[definition.apiKeyField] ? '已填写' : '未填写')
      : '固定 EMPTY',
  }
}))
const testedModelLabel = computed(() => settingsModels.find((model) => model.value === testModel.value)?.label)
const selectedModelLabel = computed(() => settingsModels.find((model) => model.value === draft.value.selected_model)?.label ?? 'DeepSeek')

watch(draft, () => {
  saveError.value = ''
  saveMessage.value = ''
  testMessage.value = ''
  testModel.value = null
  confirmationAction.value = null
}, { deep: true, flush: 'sync' })

function openEditor(definition: SettingsModelDefinition): void {
  if (formDisabled.value) return
  editingDefinition.value = definition
  editorVisible.value = true
}

function applyModelEdits(settings: SettingsDraft): void {
  if (formDisabled.value) return
  draft.value = { ...settings }
}

function confirmDraftAction(): void {
  if (confirmationAction.value === 'defaults') settingsStore.resetDraft()
  else if (confirmationAction.value === 'discard') settingsStore.restoreDraft()
  confirmationAction.value = null
}

onMounted(() => { void settingsStore.loadSettings() })
onBeforeUnmount(() => { settingsStore.cancelConnectionTest() })
</script>

<template>
  <section class="settings-page" aria-label="模型配置" :aria-busy="busy">
    <header data-visual-region="page-heading" class="settings-header">
      <p class="settings-description">管理诊断模型与 API 连接。修改仅保留在草稿中，保存后才会提交至后端。</p>
      <span v-if="loaded && !loadError" data-slot="badge" :data-variant="dirty ? 'default' : 'outline'">
        {{ dirty ? '草稿未保存' : `当前选用 · ${selectedModelLabel}` }}
      </span>
    </header>

    <p v-if="loading" class="settings-notice" role="status">正在读取后端配置…</p>
    <section v-else-if="loadError" class="settings-notice" aria-label="配置读取失败">
      <p role="alert">{{ loadError }}</p>
      <ElButton native-type="button" :disabled="busy" @click="settingsStore.loadSettings()">重新读取</ElButton>
    </section>

    <template v-else-if="loaded">
      <section data-slot="card" class="settings-section" aria-labelledby="model-section-title">
        <div class="settings-section-heading">
          <h2 id="model-section-title" data-slot="card-title">推理模型</h2>
          <span class="muted" style="font-size: 0.75rem;">单选切换在线诊断所使用的目标模型</span>
        </div>

        <div class="settings-table-region" data-slot="table-container" role="region" aria-label="推理模型配置表，可横向滚动" tabindex="0">
          <table data-slot="table" class="settings-model-table" aria-labelledby="model-section-title" aria-describedby="connection-summary">
            <thead data-slot="table-header">
              <tr data-slot="table-row">
                <th data-slot="table-head" scope="col" class="settings-selection-column">选用</th>
                <th data-slot="table-head" scope="col" class="settings-name-column">模型服务</th>
                <th data-slot="table-head" scope="col">Base URL</th>
                <th data-slot="table-head" scope="col" class="settings-model-column">模型名称</th>
                <th data-slot="table-head" scope="col" class="settings-key-column">API Key</th>
                <th data-slot="table-head" scope="col" class="settings-operation-column">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="model in modelRows"
                :key="model.value"
                data-slot="table-row"
                :class="{ 'is-selected': draft.selected_model === model.value }"
              >
                <td data-slot="table-cell" class="settings-selection-column">
                  <input
                    v-model="draft.selected_model"
                    type="radio"
                    name="settings-selected-model"
                    :value="model.value"
                    :aria-label="`选用 ${model.label}`"
                    :disabled="formDisabled"
                  >
                </td>
                <th data-slot="table-cell" scope="row">
                  <span class="settings-model-name">{{ model.label }}</span>
                  <span class="settings-model-secondary">{{ model.serviceLabel }}</span>
                </th>
                <td data-slot="table-cell" class="monospace">{{ model.endpoint || '未填写' }}</td>
                <td data-slot="table-cell" class="monospace">{{ model.modelName || '未填写' }}</td>
                <td data-slot="table-cell">
                  <span class="settings-credential-pill" :class="{ 'is-ready': model.hasKey }">{{ model.credentialLabel }}</span>
                </td>
                <td data-slot="table-cell">
                  <div class="settings-row-actions">
                    <ElButton link native-type="button" :disabled="formDisabled" :aria-label="`编辑 ${model.label}`" @click="openEditor(model)">编辑</ElButton>
                    <ElButton link native-type="button" :disabled="formDisabled" :aria-label="`测试 ${model.label} 连接`" aria-describedby="connection-summary" @click="settingsStore.testConnection(model.value)">
                      {{ testing && testModel === model.value ? '测试中…' : '测试连接' }}
                    </ElButton>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <p id="connection-summary" class="settings-help">切换模型不会清除其他配置。测试连接将直接请求对应草稿地址的 /models（10 秒超时），不代表推理可用。</p>
        <p v-if="testMessage" class="settings-notice" role="status" aria-live="polite"><strong>{{ testedModelLabel }}：</strong>{{ testMessage }}</p>
      </section>

      <footer data-slot="card" class="settings-footer">
        <p class="settings-help" role="status">{{ dirty ? '有未保存的修改，保存后生效' : '与已保存配置一致' }}</p>
        <div class="settings-actions">
          <ElButton link native-type="button" :disabled="formDisabled" @click="confirmationAction = 'defaults'">恢复默认</ElButton>
          <ElButton native-type="button" :disabled="formDisabled || !dirty" @click="confirmationAction = 'discard'">放弃修改</ElButton>
          <ElButton type="primary" native-type="button" :disabled="formDisabled || (!dirty && !saveError)" @click="settingsStore.saveSettings()">{{ saving ? '正在保存…' : saveError ? '重试保存' : '保存配置' }}</ElButton>
        </div>
      </footer>

      <section v-if="confirmationAction" class="settings-notice" aria-labelledby="draft-action-title">
        <h3 id="draft-action-title">{{ confirmationAction === 'defaults' ? '恢复默认配置？' : '放弃所有未保存的修改？' }}</h3>
        <p>{{ confirmationAction === 'defaults' ? '这会替换所有模型的草稿并清空 DeepSeek 密钥，不会立即修改后端。检查默认值后，仍需点击“保存配置”才会提交。' : '这会丢弃所有模型的未保存修改，恢复为最近一次读取或保存的配置，不会向后端发起写入。' }}</p>
        <div class="settings-actions">
          <ElButton native-type="button" :disabled="formDisabled" @click="confirmationAction = null">取消</ElButton>
          <ElButton native-type="button" :disabled="formDisabled" @click="confirmDraftAction">{{ confirmationAction === 'defaults' ? '确认恢复默认' : '确认放弃修改' }}</ElButton>
        </div>
      </section>

      <p v-if="saveError" class="settings-notice" role="alert">{{ saveError }}</p>
      <p v-if="saveMessage" class="settings-notice" role="status" aria-live="polite">{{ saveMessage }}</p>

      <ModelSettingsDialog
        v-model:visible="editorVisible"
        :definition="editingDefinition"
        :settings="draft"
        :disabled="formDisabled"
        @apply="applyModelEdits"
        @closed="editingDefinition = null"
      />
    </template>
  </section>
</template>
