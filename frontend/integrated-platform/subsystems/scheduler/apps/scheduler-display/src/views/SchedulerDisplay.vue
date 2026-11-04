<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, type ComponentPublicInstance } from 'vue'
import { createK8sBurst, deleteK8sPod } from '@/api/k8s'
import { useClusterStream } from '@/composables/useClusterStream'
import { useFlightQueue } from '@/composables/useFlightQueue'
import FailedQueue from '@/components/FailedQueue.vue'
import FlyingTaskLayer from '@/components/FlyingTaskLayer.vue'
import HybridScorePanel from '@/components/HybridScorePanel.vue'
import LiveQueue from '@/components/LiveQueue.vue'
import NodeTopologyMatrix from '@/components/NodeTopologyMatrix.vue'
import TerminalLog from '@/components/TerminalLog.vue'
import TopConsole from '@/components/TopConsole.vue'
import SdPanel from '@/components/ui/SdPanel.vue'
import type { NodeTelemetry } from '@/types/scheduler'
import { formatResourceValue } from '@/utils/format'

/**
 * The cluster reports live metrics, so the simulated noise the node cards can
 * fall back to stays at zero. Kept as one module-level object: a fresh literal
 * in the template would be a new prop value on every render.
 */
const noTelemetry: Record<string, NodeTelemetry> = {}

/**
 * The scheduler display page, usable standalone or mounted by the portal.
 *
 * The page only observes: pods are created with schedulerName=hybridscheduler
 * and bound by the in-cluster scheduler, so nothing here decides or binds.
 */
const stream = useClusterStream()
const flight = useFlightQueue({ onLog: stream.appendLog })

// Live bindings feed the animation queue; everything else is handled by the stream.
stream.setObservedHandler(flight.enqueue)

const now = ref(Date.now())
let ticker: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  ticker = setInterval(() => {
    now.value = Date.now()
  }, 500)
})

onBeforeUnmount(() => {
  if (ticker) clearInterval(ticker)
  ticker = null
})

const panelRef = ref<ComponentPublicInstance | null>(null)
const panelElement = computed<HTMLElement | null>(
  () => (panelRef.value?.$el as HTMLElement | undefined) ?? null,
)

const nodeRefs = new Map<string, HTMLElement>()

function registerNodeRef(nodeId: string, element: HTMLElement | null) {
  if (element) {
    nodeRefs.set(nodeId, element)
    return
  }

  nodeRefs.delete(nodeId)
}

const totalCapacity = computed(() =>
  stream.nodes.value.reduce(
    (sum, node) => ({
      cpu: sum.cpu + node.capacityCpu,
      mem: sum.mem + node.capacityMem,
      usedCpu: sum.usedCpu + (node.observedCpu ?? node.usedCpu),
      usedMem: sum.usedMem + (node.observedMem ?? node.usedMem),
    }),
    { cpu: 0, mem: 0, usedCpu: 0, usedMem: 0 },
  ),
)

function handleBurst() {
  void createK8sBurst(10)
    .then((result) => {
      const tasks = result.tasks ?? []
      stream.mergePendingTasks(tasks)
      stream.appendLog({
        message: `⚡ 已请求真实集群创建 ${tasks.length || 10} 个测试 Pod`,
        tone: 'warning',
      })
    })
    .catch((error: Error) => {
      stream.appendLog({ message: `❌ 创建真实测试 Pod 失败: ${error.message}`, tone: 'error' })
    })
}

function handleRemovePod(nodeId: string, taskId: string) {
  const confirmed = window.confirm(
    `确认删除真实集群 Pod？\n\nPod: ${taskId}\nNode: ${nodeId}\n\n该操作会调用 Kubernetes API 删除该 Pod。`,
  )

  if (!confirmed) {
    stream.appendLog({ message: `已取消删除 Pod: ${taskId}`, tone: 'muted' })
    return
  }

  void deleteK8sPod(nodeId, taskId, true)
    .then((result) => {
      if (result.nodes) stream.applyNodes(result.nodes)
      stream.appendLog({ message: `🧹 已请求真实集群删除 Pod: ${taskId}`, tone: 'muted' })
    })
    .catch((error: Error) => {
      stream.appendLog({ message: `❌ 删除真实 Pod 失败: ${taskId} (${error.message})`, tone: 'error' })
    })
}

/** Delete a pod the real scheduler refused to place; it has no node yet. */
function handleDeleteFailedPod(taskId: string) {
  const confirmed = window.confirm(
    `确认删除这个不可调度的 Pod？\n\nPod: ${taskId}\n\n该操作会调用 Kubernetes API 删除该 Pod。`,
  )

  if (!confirmed) return

  void deleteK8sPod('', taskId, true)
    .then(() => {
      stream.appendLog({ message: `🧹 已删除不可调度的 Pod: ${taskId}`, tone: 'muted' })
    })
    .catch((error: Error) => {
      stream.appendLog({ message: `❌ 删除 Pod 失败: ${taskId} (${error.message})`, tone: 'error' })
    })
}
</script>

<template>
  <main class="sd-root">
    <TopConsole :connection-status="stream.connectionStatus.value" :pending-count="stream.pendingQueue.value.length" :failed-count="stream.failedTasks.value.length" @burst="handleBurst" />
    <div class="sd-page-grid" data-visual-region="page-content">
      <LiveQueue :queue="stream.pendingQueue.value" :now="now" />
      <div class="sd-decision-column">
        <HybridScorePanel ref="panelRef" :observed="stream.displayedEntry.value" :final-score="stream.displayedEntry.value ? stream.finalScores.value[stream.displayedEntry.value.task.id] ?? null : null" :index="stream.displayedIndex.value + 1" :total="stream.decisionHistory.value.length" :newer-count="stream.newerCount.value" @previous="stream.goToPrevious" @next="stream.goToNext" @jump-to-latest="stream.jumpToLatest" />
        <FailedQueue :failed-tasks="stream.failedTasks.value" @delete="handleDeleteFailedPod" />
      </div>
      <NodeTopologyMatrix :nodes="stream.nodes.value" :telemetry="noTelemetry" @node-ref="registerNodeRef" @remove-pod="handleRemovePod" />
    </div>
    <div class="sd-bottom">
      <SdPanel body-class="sd-summary-body">
        <template #title>集群资源总览</template>
        <div class="sd-summary-metric"><span class="sd-metric-label" data-metric="cpu">CPU</span><span class="sd-metric-number">{{ formatResourceValue(totalCapacity.usedCpu) }}<span class="sd-metric-unit"> / {{ formatResourceValue(totalCapacity.cpu) }}c</span></span></div>
        <div class="sd-summary-metric"><span class="sd-metric-label" data-metric="memory">内存</span><span class="sd-metric-number">{{ formatResourceValue(totalCapacity.usedMem) }}<span class="sd-metric-unit"> / {{ formatResourceValue(totalCapacity.mem) }}G</span></span></div>
      </SdPanel>
      <TerminalLog :logs="stream.logs.value" />
    </div>
    <FlyingTaskLayer :active-flight="flight.activeFlight.value" :source-element="panelElement" :node-refs="nodeRefs" @complete="flight.complete" />
  </main>
</template>
