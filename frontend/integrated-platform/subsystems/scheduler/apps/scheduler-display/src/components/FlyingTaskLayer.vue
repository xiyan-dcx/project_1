<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { MOTION } from '@/lib/motion'
import { useMotionPreferences } from '@/composables/useMotionPreferences'
import { motion } from 'motion-v'
import type { ActiveFlight } from '@/types/scheduler'

const props = defineProps<{
  activeFlight: ActiveFlight | null
  /** Where the flight starts: the decision detail panel. */
  sourceElement: HTMLElement | null
  nodeRefs: Map<string, HTMLElement>
}>()

const emit = defineEmits<{ complete: [flightId: string] }>()

interface FlightPath {
  startX: number
  startY: number
  midX: number
  midY: number
  endX: number
  endY: number
}

const { reduceMotion } = useMotionPreferences()
const CARD_WIDTH = 176
const CARD_HEIGHT = 64

const path = ref<FlightPath | null>(null)

/**
 * motion-v exposes this as a prop, not an emitted event, so it is bound with
 * :on-animation-complete. The watchdog in useFlightQueue covers a missed call.
 */
function handleAnimationComplete() {
  const flight = props.activeFlight
  if (flight) emit('complete', flight.id)
}

watch(
  [() => props.activeFlight, reduceMotion],
  async ([flight, reduced]) => {
    if (!flight) {
      path.value = null
      return
    }

    if (reduced) {
      path.value = null
      // Complete after the parent's render, so disabling motion never stalls replay.
      await nextTick()
      if (props.activeFlight?.id === flight.id) emit('complete', flight.id)
      return
    }

    const source = props.sourceElement?.getBoundingClientRect()
    const target = props.nodeRefs.get(flight.targetNodeId)?.getBoundingClientRect()
    const fallbackX = window.innerWidth / 2 - CARD_WIDTH / 2
    const fallbackY = window.innerHeight / 2 - CARD_HEIGHT / 2

    const startX = source ? source.left + source.width / 2 - CARD_WIDTH / 2 : fallbackX
    const startY = source ? source.top + source.height / 2 - CARD_HEIGHT / 2 : fallbackY
    const endX = target ? target.left + target.width / 2 - CARD_WIDTH / 2 : fallbackX
    const endY = target ? target.top + Math.min(target.height - CARD_HEIGHT - 18, 118) : fallbackY

    path.value = {
      startX,
      startY,
      midX: (startX + endX) / 2,
      midY: Math.min(startY, endY) - 92,
      endX,
      endY,
    }
  },
  // Read layout after the DOM has been updated for this flight.
  { flush: 'post', immediate: true },
)
</script>

<template>
  <motion.div
    v-if="activeFlight && path && !reduceMotion"
    :key="activeFlight.id"
    class="sd-flight"
    :data-flight-id="activeFlight.id"
    :style="{ width: `${CARD_WIDTH}px` }"
    :initial="{ x: path.startX, y: path.startY, scale: 1, opacity: 0.98 }"
    :animate="{
      x: [path.startX, path.midX, path.endX],
      y: [path.startY, path.midY, path.endY],
      scale: [1, 1.08, 0.66],
      opacity: [1, 1, 0.28],
    }"
    :transition="{ duration: MOTION.flight, ease: MOTION.ease }"
    :on-animation-complete="handleAnimationComplete"
  >
    <div class="sd-task-name sd-ellipsis">
      {{ activeFlight.task.name }}
    </div>
    <div class="sd-flight-resources">
      <span>CPU {{ activeFlight.task.reqCpu }}</span>
      <span>内存 {{ activeFlight.task.reqMem }}G</span>
    </div>
  </motion.div>
</template>
