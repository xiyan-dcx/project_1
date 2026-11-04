<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { Terminal } from 'lucide-vue-next'
import SdPanel from '@/components/ui/SdPanel.vue'
import type { LogEntry, LogTone } from '@/types/scheduler'
import { formatClock } from '@/utils/format'
const props = defineProps<{ logs: LogEntry[] }>()
const listRef = ref<HTMLDivElement | null>(null)
const toneLabel: Record<LogTone, string> = { info: '信息', success: '成功', warning: '提示', error: '错误', muted: '系统' }
watch(() => props.logs, async () => {
  await nextTick()
  const element = listRef.value?.parentElement
  if (element) element.scrollTop = element.scrollHeight
})
</script>

<template>
  <SdPanel class="sd-log-panel" body-class="sd-log-body">
    <template #title><span class="sd-log-title"><Terminal :size="16" aria-hidden="true" />实时日志</span></template>
    <template #actions><span class="sd-caption">事件流</span></template>
    <div ref="listRef" role="log" aria-live="polite" aria-relevant="additions" aria-label="调度事件日志">
      <p v-if="logs.length === 0" class="sd-caption">等待调度器事件……</p>
      <div v-for="log in logs" :key="log.id" class="sd-log-entry" :data-tone="log.tone">
        <time class="sd-log-time">{{ formatClock(log.timestamp) }}</time><span class="sd-log-level">{{ toneLabel[log.tone] }}</span><span class="sd-log-message">{{ log.message }}</span>
      </div>
    </div>
  </SdPanel>
</template>
