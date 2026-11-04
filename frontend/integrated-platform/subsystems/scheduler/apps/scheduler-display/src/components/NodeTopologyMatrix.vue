<script setup lang="ts">
import { computed, ref, type ComponentPublicInstance } from 'vue'
import { ChevronDown, ChevronUp, Server, Trash2 } from 'lucide-vue-next'
import NodePodDetails from '@/components/NodePodDetails.vue'
import SdButton from '@/components/ui/SdButton.vue'
import SdPanel from '@/components/ui/SdPanel.vue'
import SdBadge from '@/components/ui/SdBadge.vue'
import SdEmptyState from '@/components/ui/SdEmptyState.vue'
import type { ClusterNode, NodeTelemetry } from '@/types/scheduler'
import { clamp, formatResourceValue, percent } from '@/utils/format'

const props = defineProps<{
  nodes: ClusterNode[]
  telemetry: Record<string, NodeTelemetry>
}>()

const emit = defineEmits<{
  nodeRef: [nodeId: string, element: HTMLElement | null]
  removePod: [nodeId: string, taskId: string]
}>()

/** The control plane stays first, everything else follows by node name. */
function orderNodes(nodes: ClusterNode[]) {
  const rank = (node: ClusterNode) => (node.role === 'control-plane' || node.role === 'master' ? 0 : 1)

  return [...nodes].sort((left, right) => {
    const rankDelta = rank(left) - rank(right)
    if (rankDelta !== 0) return rankDelta

    return left.name.localeCompare(right.name, 'en', { numeric: true })
  })
}

const orderedNodes = computed(() => orderNodes(props.nodes))
const expandedNodes = ref(new Set<string>())

function togglePods(nodeId: string) {
  if (expandedNodes.value.has(nodeId)) expandedNodes.value.delete(nodeId)
  else expandedNodes.value.add(nodeId)
}

function detailsId(nodeId: string) {
  return `sd-node-pods-${encodeURIComponent(nodeId)}`
}

interface ResourceBar {
  key: string
  label: string
  unit: string
  live: boolean
  displayed: number
  capacity: number
  value: number
  metric: string
}

function resourceBars(node: ClusterNode): ResourceBar[] {
  const signal = props.telemetry[node.id] ?? { cpuNoise: 0, memNoise: 0 }

  const observedCpu = node.observedCpu
  const observedMem = node.observedMem
  const displayedCpu = clamp(
    observedCpu !== undefined ? observedCpu : node.usedCpu + signal.cpuNoise,
    0,
    node.capacityCpu,
  )
  const displayedMem = clamp(
    observedMem !== undefined ? observedMem : node.usedMem + signal.memNoise,
    0,
    node.capacityMem,
  )

  return [
    {
      key: 'cpu',
      label: 'CPU',
      unit: 'c',
      live: observedCpu !== undefined,
      displayed: displayedCpu,
      capacity: node.capacityCpu,
      value: percent(displayedCpu, node.capacityCpu),
      metric: 'cpu',
    },
    {
      key: 'mem',
      label: '内存',
      unit: 'G',
      live: observedMem !== undefined,
      displayed: displayedMem,
      capacity: node.capacityMem,
      value: percent(displayedMem, node.capacityMem),
      metric: 'memory',
    },
  ]
}

function setNodeRef(nodeId: string, element: Element | ComponentPublicInstance | null) {
  emit('nodeRef', nodeId, element instanceof HTMLElement ? element : null)
}

function podNamespace(podId: string) {
  return podId.split('/')[0] ?? 'default'
}
</script>

<template>
  <SdPanel class="sd-node-panel" body-class="sd-node-grid">
    <template #title>节点资源</template>
    <template #description>实时用量与已分配的 Pod</template>
    <template #actions><SdBadge>{{ nodes.length }} 个节点</SdBadge></template>
    <SdEmptyState v-if="nodes.length === 0" title="等待节点数据" description="连接成功后会显示集群资源"><template #icon><Server :size="18" /></template></SdEmptyState>
    <article v-for="node in orderedNodes" :key="node.id" :ref="(element) => setNodeRef(node.id, element)" class="sd-node-card" :class="{ 'sd-node-card-expanded': expandedNodes.has(node.id) }" :data-node-id="node.id">
      <div class="sd-node-heading">
        <div class="sd-node-identity">
          <span class="sd-icon-box" aria-hidden="true"><Server :size="16" /></span>
          <div class="sd-min-w-0"><h3 class="sd-node-name sd-ellipsis" :title="node.name">{{ node.name }}</h3><p class="sd-caption">{{ node.role === 'control-plane' || node.role === 'master' ? '控制节点' : '工作节点' }}</p></div>
        </div>
        <SdBadge>{{ node.podCount ?? node.pods.length }} Pod</SdBadge>
      </div>
      <div class="sd-resources">
        <div v-for="bar in resourceBars(node)" :key="bar.key">
          <div class="sd-resource-heading">
            <span class="sd-metric-label" :data-metric="bar.metric">{{ bar.label }}<span class="sd-resource-meta">{{ bar.live ? '实时' : '申请量' }}</span></span>
            <span class="sd-resource-value">{{ formatResourceValue(bar.displayed) }} / {{ formatResourceValue(bar.capacity) }}{{ bar.unit }}</span>
          </div>
          <div class="sd-progress" role="progressbar" :aria-label="`${node.name} ${bar.label}${bar.live ? '实时用量' : '申请量'}`" :aria-valuenow="bar.value" :aria-valuemin="0" :aria-valuemax="100" :aria-valuetext="`${formatResourceValue(bar.displayed)} / ${formatResourceValue(bar.capacity)}${bar.unit}`">
            <div class="sd-progress-fill" :data-metric="bar.metric" :style="{ width: `${bar.value}%` }" />
          </div>
        </div>
      </div>
      <div class="sd-pod-list">
        <div class="sd-pod-display">
          <NodePodDetails v-if="expandedNodes.has(node.id)" :id="detailsId(node.id)" :node="node" @remove-pod="(taskId) => emit('removePod', node.id, taskId)" />
          <template v-else>
            <SdEmptyState v-if="node.pods.length === 0" title="暂无驻留 Pod" />
            <template v-else>
              <p v-if="node.pods.length < (node.podCount ?? node.pods.length)" class="sd-caption sd-mb-2">显示 {{ node.pods.length }} / {{ node.podCount ?? node.pods.length }} 个 Pod</p>
              <div class="sd-pod-tags">
                <template v-for="pod in node.pods" :key="pod.id">
                  <button v-if="pod.managed" type="button" class="sd-pod-tag" data-slot="button" data-variant="destructive" data-size="sm" :title="`删除测试 Pod：${pod.id}`" :aria-label="`删除测试 Pod：${pod.id}`" @click="emit('removePod', node.id, pod.id)">
                    <span class="sd-pod-text">{{ podNamespace(pod.id) }}/{{ pod.name }}</span><span class="sd-pod-resource">{{ pod.reqCpu }}c/{{ pod.reqMem }}G</span><Trash2 :size="12" aria-hidden="true" />
                  </button>
                  <span v-else class="sd-pod-tag" :title="`${pod.id}（只读）`"><span class="sd-pod-text">{{ podNamespace(pod.id) }}/{{ pod.name }}</span><span class="sd-pod-resource">{{ pod.reqCpu }}c/{{ pod.reqMem }}G</span></span>
                </template>
              </div>
            </template>
          </template>
        </div>
        <SdButton class="sd-pod-toggle" variant="secondary" :aria-expanded="expandedNodes.has(node.id)" :aria-controls="expandedNodes.has(node.id) ? detailsId(node.id) : undefined" :aria-label="`${expandedNodes.has(node.id) ? '收起' : '展开'} ${node.name} 的 Pod 资源`" @click="togglePods(node.id)">
          <component :is="expandedNodes.has(node.id) ? ChevronUp : ChevronDown" aria-hidden="true" />
          {{ expandedNodes.has(node.id) ? '收起 Pod 资源' : `展开全部 Pod 资源（${node.podCount ?? node.pods.length}）` }}
        </SdButton>
      </div>
    </article>
  </SdPanel>
</template>
