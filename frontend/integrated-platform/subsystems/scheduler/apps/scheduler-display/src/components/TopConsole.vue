<script setup lang="ts">
import { computed } from 'vue'
import { RadioTower, Plus } from 'lucide-vue-next'
import SdBadge from '@/components/ui/SdBadge.vue'
import SdButton from '@/components/ui/SdButton.vue'
import type { K8sConnectionStatus } from '@/types/scheduler'

const props = defineProps<{ connectionStatus: K8sConnectionStatus; pendingCount: number; failedCount: number }>()
defineEmits<{ burst: [] }>()
const statusLabels: Record<K8sConnectionStatus, string> = {
  mock: '演示模式', connecting: '连接中', connected: '已连接', disconnected: '连接中断', error: '连接失败',
}
const statusTone = computed(() => props.connectionStatus === 'connected' ? 'success'
  : props.connectionStatus === 'error' ? 'danger' : 'warning')
</script>

<template>
  <header class="sd-top" data-visual-region="page-heading">
    <div class="sd-heading">
      <p class="sd-eyebrow">HYBRID SCHEDULER</p>
      <h1 class="sd-page-title">调度算法可视化系统</h1>
      <p class="sd-subtitle">观察集群资源与调度器决策 · 排队 {{ pendingCount }} · 不可调度 {{ failedCount }}</p>
    </div>
    <div class="sd-top-actions">
      <SdBadge :tone="statusTone" role="status"><RadioTower :size="12" aria-hidden="true" />{{ statusLabels[connectionStatus] }}</SdBadge>
      <SdButton @click="$emit('burst')"><Plus aria-hidden="true" />创建测试 Pod ×10</SdButton>
    </div>
  </header>
</template>
