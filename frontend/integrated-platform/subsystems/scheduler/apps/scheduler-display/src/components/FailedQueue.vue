<script setup lang="ts">
import { Trash2, Check } from 'lucide-vue-next'
import SdPanel from '@/components/ui/SdPanel.vue'
import SdBadge from '@/components/ui/SdBadge.vue'
import SdButton from '@/components/ui/SdButton.vue'
import SdEmptyState from '@/components/ui/SdEmptyState.vue'
import type { FailedTask } from '@/types/scheduler'
defineProps<{ failedTasks: FailedTask[] }>()
defineEmits<{ delete: [taskId: string] }>()
</script>

<template>
  <SdPanel class="sd-failed-panel">
    <template #title>不可调度任务</template>
    <template #description>查看调度器返回的原因</template>
    <template #actions><SdBadge :tone="failedTasks.length ? 'danger' : 'neutral'">{{ failedTasks.length }} 个</SdBadge></template>
    <SdEmptyState v-if="failedTasks.length === 0" title="暂无不可调度任务"><template #icon><Check :size="18" /></template></SdEmptyState>
    <article v-for="task in failedTasks.slice(0, 10)" :key="task.id" class="sd-task">
      <div class="sd-task-heading">
        <div class="sd-min-w-0"><p class="sd-task-name sd-ellipsis" :title="task.name">{{ task.name }}</p></div>
        <SdButton variant="destructive" size="icon" :title="`删除 Pod：${task.name}`" :aria-label="`删除 Pod：${task.name}`" @click="$emit('delete', task.id)"><Trash2 aria-hidden="true" /></SdButton>
      </div>
      <p class="sd-failure-reason">{{ task.reason }}</p>
    </article>
    <p v-if="failedTasks.length > 10" class="sd-caption sd-mt-3">显示前 10 个，共 {{ failedTasks.length }} 个任务</p>
  </SdPanel>
</template>
