import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { fetchK8sSnapshot, getEngineApiPath, openK8sEventStream } from '@/api/k8s'
import type {
  ClusterNode,
  FailedTask,
  FinalScoreDecision,
  K8sConnectionStatus,
  K8sStreamEvent,
  LogEntry,
  LogPayload,
  ObservedScheduling,
  ScheduledPayload,
  Task,
} from '@/types/scheduler'

/**
 * How many decisions stay browsable. Kept in step with the proxy's
 * recentScheduled window so a reload restores roughly what you could scroll
 * through before it.
 */
const DECISION_HISTORY_LIMIT = 60
/** Bound for the log buffer and the final-score cache. */
const LOG_LIMIT = 180
const FINAL_SCORE_LIMIT = 80
/** Bound for the binding de-duplication set. */
const SEEN_SCHEDULED_LIMIT = 600

function createLog(message: string, tone: LogEntry['tone'] = 'info'): LogEntry {
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random()}`

  return { id, timestamp: Date.now(), tone, message: message.replaceAll('真调度器', '调度器') }
}

/**
 * Owns everything that comes from the engine: the SSE stream, the cluster
 * snapshot, the decision history and its cursor.
 *
 * The page only observes. Pods are created with schedulerName=hybridscheduler
 * and bound by the in-cluster scheduler, so nothing here decides or binds.
 */
export function useClusterStream() {
  const connectionStatus = ref<K8sConnectionStatus>('connecting')
  const nodes = ref<ClusterNode[]>([])
  const pendingQueue = ref<Task[]>([])
  const failedTasks = ref<FailedTask[]>([])
  const finalScores = ref<Record<string, FinalScoreDecision>>({})
  const decisionHistory = ref<ObservedScheduling[]>([])
  const selectedKey = ref<string | null>(null)
  const logs = ref<LogEntry[]>([
    createLog(`系统就绪: 正在连接真实 K8s 集群 ${getEngineApiPath()}`, 'muted'),
    createLog('调度模式: 旁观调度器 hybridscheduler 的绑定结果', 'muted'),
  ])

  const pageLoadedAt = Date.now()
  let seenScheduled = new Set<string>()
  let adoptedRecent = false
  let observedHandler: ((observed: ObservedScheduling) => void) | null = null
  let active = false
  let source: EventSource | null = null

  function appendLog({ message, tone = 'info' }: LogPayload) {
    logs.value = [...logs.value.slice(-(LOG_LIMIT - 1)), createLog(message, tone)]
  }

  /** Wired once by the page so live bindings reach the animation queue. */
  function setObservedHandler(handler: (observed: ObservedScheduling) => void) {
    observedHandler = handler
  }

  function ingestScheduled(payload: ScheduledPayload, options: { animate: boolean }) {
    if (seenScheduled.has(payload.id)) return

    // Bound the dedupe set so a long running page does not grow forever.
    if (seenScheduled.size > SEEN_SCHEDULED_LIMIT) {
      seenScheduled = new Set<string>()
    }

    seenScheduled.add(payload.id)

    const observed: ObservedScheduling = {
      id: payload.id,
      task: payload.task,
      nodeName: payload.nodeName,
      scheduledAt: payload.scheduledAt,
      latencyMs: payload.latencyMs,
      profile: payload.profile,
      intentSha256: payload.intentSha256,
      score: payload.score.total,
      components: payload.score.components,
    }

    // Every binding becomes browsable; only live ones get an animation.
    const next = [...decisionHistory.value, observed]
    decisionHistory.value =
      next.length > DECISION_HISTORY_LIMIT ? next.slice(next.length - DECISION_HISTORY_LIMIT) : next

    if (options.animate) observedHandler?.(observed)
  }

  function handleScheduled(event: K8sStreamEvent) {
    if (event.recentScheduled) {
      if (!adoptedRecent) {
        // First snapshot after load: seed the browser with everything the proxy
        // still remembers so the history survives a reload, but only animate the
        // bindings that happened after this page opened.
        adoptedRecent = true
        const clockSkew = (event.serverNow ?? Date.now()) - Date.now()
        const cutoff = pageLoadedAt + clockSkew

        event.recentScheduled.forEach((payload) => {
          ingestScheduled(payload, { animate: payload.scheduledAt > cutoff })
        })
        return
      }

      // Snapshots carry the recent bindings, so a dropped SSE message or a
      // stalled animation queue self-heals on the next refresh.
      event.recentScheduled.forEach((payload) => ingestScheduled(payload, { animate: true }))
      return
    }

    if (!event.id || !event.task || !event.nodeName || !event.score) return

    ingestScheduled(
      {
        id: event.id,
        task: event.task,
        nodeName: event.nodeName,
        scheduledAt: event.scheduledAt ?? Date.now(),
        latencyMs: event.latencyMs ?? 0,
        profile: event.profile ?? 'unknown',
        intentSha256: event.intentSha256 ?? '',
        score: event.score,
      },
      { animate: true },
    )
  }

  function handleFinalScore(decision: FinalScoreDecision) {
    const existing = finalScores.value[decision.podKey]
    if (existing && existing.scoredAt >= decision.scoredAt) return

    const next: Record<string, FinalScoreDecision> = { ...finalScores.value, [decision.podKey]: decision }
    const keys = Object.keys(next)

    if (keys.length > FINAL_SCORE_LIMIT) {
      for (const key of keys.slice(0, keys.length - FINAL_SCORE_LIMIT)) delete next[key]
    }

    finalScores.value = next
  }

  function handleEvent(event: K8sStreamEvent) {
    if (!active) return

    if (event.type === 'snapshot') {
      if (event.nodes) nodes.value = event.nodes
      if (event.pendingQueue) pendingQueue.value = event.pendingQueue
      if (event.failedTasks) failedTasks.value = event.failedTasks
      connectionStatus.value = 'connected'
      handleScheduled(event)
      event.recentFinalScores?.forEach(handleFinalScore)
      return
    }

    if (event.type === 'task' && event.task) {
      const task = event.task
      if (!pendingQueue.value.some((item) => item.id === task.id)) {
        pendingQueue.value = [...pendingQueue.value, task]
      }
      return
    }

    if (event.type === 'nodeUpdate' && event.nodes) {
      nodes.value = event.nodes
      return
    }

    if (event.type === 'scheduled' && event.task && event.nodeName) {
      handleScheduled(event)
      return
    }

    if (event.type === 'finalScore' && event.finalScore) {
      handleFinalScore(event.finalScore)
      return
    }

    if (event.type === 'log' && event.message) {
      appendLog({ message: event.message, tone: event.tone ?? 'info' })
    }
  }

  function applyNodes(next: ClusterNode[]) {
    nodes.value = next
  }

  /** Adds tasks this page just created, skipping ones already in the queue. */
  function mergePendingTasks(tasks: Task[]) {
    if (tasks.length === 0) return

    const known = new Set(pendingQueue.value.map((task) => task.id))
    pendingQueue.value = [...pendingQueue.value, ...tasks.filter((task) => !known.has(task.id))]
  }

  // The browser follows the newest decision unless the user navigated away.
  const displayedEntry = computed(() => {
    const history = decisionHistory.value
    if (history.length === 0) return null
    if (!selectedKey.value) return history[history.length - 1]

    return history.find((entry) => entry.task.id === selectedKey.value) ?? history[history.length - 1]
  })

  const displayedIndex = computed(() => {
    const entry = displayedEntry.value
    return entry ? decisionHistory.value.findIndex((item) => item.task.id === entry.task.id) : -1
  })

  const newerCount = computed(() =>
    displayedIndex.value >= 0 ? decisionHistory.value.length - 1 - displayedIndex.value : 0,
  )

  // If the viewed decision scrolls out of the window, fall back to following.
  watch(decisionHistory, (history) => {
    if (!selectedKey.value) return
    if (history.some((entry) => entry.task.id === selectedKey.value)) return
    selectedKey.value = null
  })

  function goToPrevious() {
    if (displayedIndex.value <= 0) return
    selectedKey.value = decisionHistory.value[displayedIndex.value - 1].task.id
  }

  function goToNext() {
    const last = decisionHistory.value.length - 1
    if (displayedIndex.value < 0 || displayedIndex.value >= last) return

    const nextIndex = displayedIndex.value + 1
    // Landing on the newest entry resumes following future decisions.
    selectedKey.value = nextIndex === last ? null : decisionHistory.value[nextIndex].task.id
  }

  function jumpToLatest() {
    selectedKey.value = null
  }

  onMounted(() => {
    active = true
    connectionStatus.value = 'connecting'

    fetchK8sSnapshot()
      .then((snapshot) => {
        if (!active) return

        nodes.value = snapshot.nodes
        pendingQueue.value = snapshot.pendingQueue
        connectionStatus.value = 'connected'
        appendLog({
          message: `已连接真实 K8s 快照: ${snapshot.nodes.length} nodes, ${snapshot.pendingQueue.length} pending pods`,
          tone: 'success',
        })

        source = openK8sEventStream(handleEvent, () => {
          if (!active) return
          connectionStatus.value = 'disconnected'
          appendLog({
            message: 'K8s 事件流连接中断，等待后端或 Ingress 恢复',
            tone: 'warning',
          })
        })
      })
      .catch((error: Error) => {
        if (!active) return
        connectionStatus.value = 'error'
        appendLog({ message: `K8s 快照同步失败: ${error.message}`, tone: 'error' })
      })
  })

  onBeforeUnmount(() => {
    active = false
    source?.close()
    source = null
  })

  return {
    connectionStatus,
    nodes,
    pendingQueue,
    failedTasks,
    finalScores,
    decisionHistory,
    logs,
    displayedEntry,
    displayedIndex,
    newerCount,
    appendLog,
    applyNodes,
    mergePendingTasks,
    setObservedHandler,
    goToPrevious,
    goToNext,
    jumpToLatest,
  }
}
