<script setup lang="ts">
import { computed, watch } from 'vue'
import { useVirtualList } from '@vueuse/core'
import { Trash2 } from 'lucide-vue-next'
import SdButton from '@/components/ui/SdButton.vue'
import type { ScheduledPod } from '@/types/scheduler'

const props = defineProps<{ nodeName: string; namespace: string; pods: ScheduledPod[]; searchTerm: string; sortBy: 'name' | 'cpu' | 'memory' }>()
defineEmits<{ removePod: [taskId: string] }>()
const resourceNumber = new Intl.NumberFormat('en', { maximumFractionDigits: 6 })
const rows = computed(() => props.pods)
const { list, containerProps, wrapperProps, scrollTo } = useVirtualList(rows, { itemHeight: 44, overscan: 4 })
// Snapshots replace the rows on every update. Only an explicit search/sort
// change should reset the reader's position in a large namespace.
watch([() => props.searchTerm, () => props.sortBy], () => scrollTo(0), { flush: 'post' })
</script>

<template>
  <div class="sd-pod-table-scroll" role="table" :aria-label="`${nodeName} ${namespace} 的 Pod 资源`" :aria-rowcount="pods.length + 1" aria-colcount="4" tabindex="0">
    <div class="sd-pod-table-inner">
      <div role="rowgroup"><div class="sd-pod-table-row sd-pod-table-heading" role="row" aria-rowindex="1"><span role="columnheader">Pod 名称</span><span role="columnheader">CPU 申请量</span><span role="columnheader">内存申请量</span><span role="columnheader" aria-label="操作" /></div></div>
      <div v-bind="containerProps" class="sd-pod-detail-scroll" :style="{ height: `${Math.min(pods.length * 44, 264)}px` }" role="rowgroup" tabindex="0" :aria-label="`${namespace} Pod 列表，可滚动查看全部资源`">
        <div v-bind="wrapperProps" role="presentation">
          <div v-for="{ data: pod, index } in list" :key="pod.id" class="sd-pod-table-row" role="row" :aria-rowindex="index + 2" :data-pod-id="pod.id">
            <span role="cell" class="sd-task-name sd-ellipsis" :title="pod.id">{{ pod.name }}</span>
            <span role="cell" class="sd-pod-table-number" data-metric="cpu">{{ resourceNumber.format(pod.reqCpu) }}c</span>
            <span role="cell" class="sd-pod-table-number" data-metric="memory">{{ resourceNumber.format(pod.reqMem) }}G</span>
            <span role="cell"><SdButton v-if="pod.managed" variant="destructive" size="icon" :aria-label="`删除测试 Pod：${pod.id}`" :title="`删除测试 Pod：${pod.id}`" @click="$emit('removePod', pod.id)"><Trash2 aria-hidden="true" /></SdButton></span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
