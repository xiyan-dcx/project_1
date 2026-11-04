<script setup lang="ts">
import { computed } from 'vue'
import { asObject, asText } from '../../api/diagnosis'

const props = defineProps<{ usage: unknown; model?: string }>()
const tokenFields = [
  { key: 'prompt_tokens', label: '输入' },
  { key: 'completion_tokens', label: '输出' },
  { key: 'total_tokens', label: '总计' },
]
const tokens = computed(() => {
  const usage = asObject(props.usage)
  return tokenFields.map((field) => ({ ...field, value: asText(usage[field.key]) || '未提供' }))
})
</script>

<template>
  <div class="token-usage tabular-nums" aria-label="模型与 Token 用量">
    <span v-if="props.model" class="token-chip model-chip">模型 <strong class="monospace">{{ props.model }}</strong></span>
    <span class="usage-label">Token 用量</span>
    <span v-for="token in tokens" :key="token.key" class="token-chip">{{ token.label }} <strong>{{ token.value }}</strong></span>
  </div>
</template>

<style scoped>
.token-usage {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 10px;
  color: var(--muted-foreground);
  font-size: 0.75rem;
  line-height: 1.5;
}

.usage-label {
  color: var(--muted-foreground);
  font-weight: 500;
}

.token-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 9px;
  background: var(--rainflow-surface-inset);
  box-shadow: inset 0 0 0 1px var(--rainflow-divider);
  border-radius: var(--radius-4xl);
  color: var(--muted-foreground);
}

.model-chip {
  color: var(--foreground);
}

strong {
  color: var(--foreground);
  font-weight: 500;
}
</style>
