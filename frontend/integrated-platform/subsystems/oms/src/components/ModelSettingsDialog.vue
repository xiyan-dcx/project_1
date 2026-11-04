<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElButton, ElDialog, ElForm, ElFormItem, ElInput } from 'element-plus'
import {
  createDefaultSettings, getSettingsValidationMessage,
  type SettingsDraft, type SettingsModelDefinition,
} from '../stores/settings'

const props = defineProps<{
  visible: boolean
  definition: SettingsModelDefinition | null
  settings: SettingsDraft
  disabled: boolean
}>()
const emit = defineEmits<{
  'update:visible': [visible: boolean]
  apply: [settings: SettingsDraft]
  closed: []
}>()
const editedSettings = ref<SettingsDraft>(createDefaultSettings())
const validationMessage = ref('')
const dialogTitle = computed(() => `编辑 ${props.definition?.label ?? '模型配置'}`)

watch(() => props.visible, (visible) => {
  if (!visible) return
  editedSettings.value = { ...props.settings }
  validationMessage.value = ''
})
watch(editedSettings, () => { validationMessage.value = '' }, { deep: true })

function applyEdits(): void {
  if (props.disabled || !props.definition) return
  validationMessage.value = getSettingsValidationMessage(editedSettings.value)
  if (validationMessage.value) return
  emit('apply', { ...editedSettings.value })
  emit('update:visible', false)
}

function clearEditor(): void {
  editedSettings.value = createDefaultSettings()
  validationMessage.value = ''
  emit('closed')
}
</script>

<template>
  <ElDialog
    :model-value="props.visible"
    :title="dialogTitle"
    width="min(540px, calc(100vw - 32px))"
    class="settings-model-dialog"
    :close-on-click-modal="false"
    :close-on-press-escape="!props.disabled"
    :show-close="!props.disabled"
    append-to-body
    destroy-on-close
    @update:model-value="emit('update:visible', $event)"
    @closed="clearEditor"
  >
    <template v-if="props.definition">
      <ElForm
        id="model-settings-editor"
        :model="editedSettings"
        label-position="top"
        :disabled="props.disabled"
        autocomplete="off"
        @submit.prevent="applyEdits"
      >
        <ElFormItem :label="`${props.definition.label} Base URL`" for="model-editor-url">
          <ElInput
            id="model-editor-url"
            v-model="editedSettings[props.definition.endpointField]"
            type="url"
            placeholder="https://example.com/v1"
            :spellcheck="false"
            aria-describedby="model-editor-help"
          />
        </ElFormItem>

        <ElFormItem v-if="props.definition.modelField" :label="`${props.definition.label} 模型名称`" for="model-editor-name">
          <ElInput id="model-editor-name" v-model="editedSettings[props.definition.modelField]" placeholder="服务提供的模型 ID" :spellcheck="false" />
        </ElFormItem>
        <template v-else>
          <ElFormItem label="模型名称（固定）" for="model-editor-name">
            <ElInput id="model-editor-name" model-value="Qwen/Qwen2.5-7B-Instruct" readonly />
          </ElFormItem>
        </template>

        <ElFormItem v-if="props.definition.apiKeyField" :label="`${props.definition.label} API Key`" for="model-editor-key">
          <ElInput
            id="model-editor-key"
            v-model="editedSettings[props.definition.apiKeyField]"
            type="password"
            autocomplete="new-password"
            :spellcheck="false"
            aria-describedby="model-editor-help"
          />
        </ElFormItem>

        <p id="model-editor-help" class="settings-help">仅支持不含凭据与参数的 HTTP(S) 地址；留空并保存会清空对应配置，密钥不写入浏览器存储。</p>
        <p v-if="validationMessage" class="settings-notice" role="alert">{{ validationMessage }}</p>
      </ElForm>
    </template>
    <template #footer>
      <div class="settings-actions model-editor-actions">
        <ElButton native-type="button" :disabled="props.disabled" @click="emit('update:visible', false)">取消</ElButton>
        <ElButton type="primary" native-type="submit" form="model-settings-editor" :disabled="props.disabled">应用到草稿</ElButton>
      </div>
    </template>
  </ElDialog>
</template>
