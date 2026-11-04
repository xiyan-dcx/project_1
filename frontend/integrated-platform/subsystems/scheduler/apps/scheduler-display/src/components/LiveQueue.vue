<script setup lang="ts">
import { computed } from 'vue'
import { Clock3, Layers } from 'lucide-vue-next'
import SdPanel from '@/components/ui/SdPanel.vue'
import SdBadge from '@/components/ui/SdBadge.vue'
import SdEmptyState from '@/components/ui/SdEmptyState.vue'
import type { Task } from '@/types/scheduler'
import { formatClock, formatDuration } from '@/utils/format'
const props = defineProps<{ queue: Task[]; now: number }>()
const visibleQueue = computed(() => props.queue.slice(0, 28))
</script>

<template>
  <SdPanel class="sd-queue-panel">
    <template #title>排队任务</template>
    <template #description>按进入队列的顺序等待调度</template>
    <template #actions><SdBadge>{{ queue.length }} 个</SdBadge></template>
    <SdEmptyState v-if="queue.length === 0" title="队列空闲" description="新任务进入后会显示在这里">
      <template #icon><Layers :size="18" /></template>
    </SdEmptyState>
    <article v-for="(task, index) in visibleQueue" :key="task.id" class="sd-task sd-content-reveal">
      <div class="sd-task-heading">
        <div class="sd-min-w-0">
          <div class="sd-task-name sd-ellipsis" :title="task.name">{{ task.name }}</div>
          <div class="sd-task-time"><Clock3 :size="12" aria-hidden="true" /><span>{{ formatClock(task.createdAt) }}</span></div>
        </div>
        <SdBadge :tone="index === 0 ? 'warning' : 'neutral'">{{ index === 0 ? '队首' : `#${index + 1}` }}</SdBadge>
      </div>
      <p class="sd-caption sd-mt-2">已等待 {{ formatDuration(now - task.createdAt) }}</p>
      <div class="sd-task-resources sd-mono"><SdBadge tone="cpu">CPU {{ task.reqCpu }}c</SdBadge><SdBadge tone="memory">内存 {{ task.reqMem }}G</SdBadge></div>
    </article>
    <p v-if="queue.length > visibleQueue.length" class="sd-caption sd-mt-3">显示前 {{ visibleQueue.length }} 个，共 {{ queue.length }} 个任务</p>
  </SdPanel>
</template>
