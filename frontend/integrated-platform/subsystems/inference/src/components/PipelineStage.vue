<script setup lang="ts">
import { STAGE_NAMES } from '@/constants/inference'
import type { StageState } from '@/types/inference'

defineProps<{ stage: StageState }>()
</script>

<template>
  <div class="stage" :class="stage.status">
    <div class="indicator">
      <svg v-if="stage.status === 'done'" viewBox="0 0 11 11"><polyline points="1.5 5.5 4.5 8.5 9.5 2.5" /></svg>
      <span v-else-if="stage.status === 'error'">!</span>
    </div>
    <div class="name">{{ STAGE_NAMES[stage.name] }}</div>
    <div class="detail">{{ stage.detail }}</div>
    <div class="latency" :class="{ visible: stage.latency !== null }">{{ stage.latency ?? '—' }}s</div>
  </div>
</template>

<style scoped>
.stage { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 5px; text-align: center; }
.indicator { width: 24px; height: 24px; display: grid; place-items: center; flex: 0 0 auto; border: 1.5px solid var(--border); border-radius: 50%; background: white; }
.active .indicator { border-color: #c8c8c8; border-top-color: var(--primary); animation: spin .72s linear infinite; }
.done .indicator { border-color: var(--primary); background: var(--primary); }
.error .indicator { border-color: #dc2626; color: #dc2626; font-weight: 700; }
.indicator svg { width: 11px; fill: none; stroke: white; stroke-width: 2.5; }
.name { font-size: 11px; font-weight: 600; }
.detail { min-height: 29px; padding: 0 2px; color: var(--muted-foreground); font-size: 10px; line-height: 1.4; }
.active .detail { color: var(--foreground); }
.latency { padding: 1px 7px; opacity: 0; border: 1px solid var(--border); border-radius: 99px; background: var(--muted); color: var(--muted-foreground); font-family: var(--font-mono); font-size: 10px; }
.latency.visible { opacity: 1; }
</style>
