import { onBeforeUnmount, ref } from 'vue'
import { MOTION } from '@/lib/motion'
import type { ActiveFlight, LogPayload, ObservedScheduling } from '@/types/scheduler'

/** Above this backlog the observed bindings are collapsed instead of replayed. */
const MAX_FLIGHT_QUEUE = 12
/** Allow the full flight plus render slack before recovering a missed callback. */
const FLIGHT_WATCHDOG_MS = MOTION.flight * 1000 + 1500

interface UseFlightQueueOptions {
  onLog: (payload: LogPayload) => void
}

/**
 * Replays bindings the real scheduler performed, one flying card at a time.
 *
 * The scheduler owns the binding, so this never touches node state: it only
 * animates what was observed. When a burst outruns the animation the leftovers
 * are counted and summarised in a single log line rather than queued for
 * minutes.
 */
export function useFlightQueue({ onLog }: UseFlightQueueOptions) {
  const activeFlight = ref<ActiveFlight | null>(null)
  const pending = ref<ObservedScheduling[]>([])
  const collapsedCount = ref(0)

  let watchdog: ReturnType<typeof setTimeout> | null = null

  function clearWatchdog() {
    if (watchdog) {
      clearTimeout(watchdog)
      watchdog = null
    }
  }

  function flushCollapsed() {
    if (activeFlight.value || pending.value.length > 0 || collapsedCount.value === 0) return

    const count = collapsedCount.value
    collapsedCount.value = 0
    onLog({
      message: `⚡ 已批量绑定 ${count} 个 Pod（飞行动画已折叠，节点视图直接更新）`,
      tone: 'warning',
    })
  }

  function pump() {
    if (activeFlight.value) return

    const [next, ...rest] = pending.value

    if (!next) {
      flushCollapsed()
      return
    }

    pending.value = rest
    activeFlight.value = {
      id: next.id,
      task: next.task,
      targetNodeId: next.nodeName,
      score: next.score,
    }

    clearWatchdog()
    watchdog = setTimeout(() => complete(next.id), FLIGHT_WATCHDOG_MS)
  }

  /**
   * Reports every binding immediately so the log and the detail panel stay
   * complete; only the animation is rate limited.
   */
  function enqueue(observed: ObservedScheduling) {
    onLog({
      message: `调度器绑定: ${observed.task.name} -> ${observed.nodeName} (HybridScore ${observed.score} · ${observed.profile})`,
      tone: 'success',
    })

    if (pending.value.length >= MAX_FLIGHT_QUEUE) {
      collapsedCount.value += 1
      return
    }

    pending.value = [...pending.value, observed]
    pump()
  }

  /** Called when the flying card reaches its target node. */
  function complete(flightId: string) {
    if (activeFlight.value?.id !== flightId) return

    clearWatchdog()
    activeFlight.value = null
    pump()
  }

  onBeforeUnmount(clearWatchdog)

  return {
    activeFlight,
    pendingCount: () => pending.value.length,
    collapsedCount,
    enqueue,
    complete,
  }
}
