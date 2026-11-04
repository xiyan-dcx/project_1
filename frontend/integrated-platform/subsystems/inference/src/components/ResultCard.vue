<script setup lang="ts">
import { computed } from 'vue'
import { ROUTE_LABELS } from '@/constants/inference'
import type { InferenceResult } from '@/types/inference'

const props = defineProps<{ result: InferenceResult }>()
const sourceClass = computed(() => {
  const source = props.result.source.toLowerCase()
  if (source.includes('error') || source.includes('fallback')) return 'fallback'
  return source.includes('cloud') ? 'cloud' : 'edge'
})
</script>

<template>
  <article class="result-card">
    <header>
      <span class="filename">{{ result.video || '文本问答' }}</span>
      <span class="source" :class="sourceClass">{{ result.source }}</span>
      <span v-if="result.latencies" class="total">{{ result.latencies.total }}s</span>
    </header>
    <div class="body">
      <p>{{ result.answer || '（无输出）' }}</p>
      <template v-if="result.latencies">
        <div class="chips">
          <span>抽帧 <b>{{ result.latencies.extract }}s</b></span>
          <span>评估 <b>{{ result.latencies.assess }}s</b></span>
          <span>路由 <b>{{ result.latencies.route }}s</b></span>
          <span>总计 <b>{{ result.latencies.total }}s</b></span>
        </div>
        <div v-if="result.routePath" class="route">路由路径：{{ result.routePath }} → {{ ROUTE_LABELS[result.routePath] || result.routePath }}</div>
      </template>
    </div>
  </article>
</template>

<style scoped>
.result-card { overflow: hidden; border: 1px solid var(--border); border-radius: var(--radius); background: white; box-shadow: var(--shadow); animation: slide-in .22s ease; }
header { padding: 9px 13px; display: flex; align-items: center; gap: 8px; border-bottom: 1px solid var(--border); background: var(--muted); }
.filename { flex: 1; overflow: hidden; font-family: var(--font-mono); font-size: 11px; font-weight: 500; text-overflow: ellipsis; white-space: nowrap; }
.source { padding: 2px 7px; flex: 0 0 auto; border: 1px solid; border-radius: 99px; font-size: 10px; font-weight: 600; }
.source.edge { border-color: #bbf7d0; background: #f0fdf4; color: #166534; }
.source.cloud { border-color: #bfdbfe; background: #eff6ff; color: #1e3a5f; }
.source.fallback { border-color: #fde68a; background: #fffbeb; color: #78350f; }
.total { flex: 0 0 auto; color: var(--muted-foreground); font-family: var(--font-mono); font-size: 10px; }
.body { padding: 13px 14px; }
p { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 14px; line-height: 1.8; }
.chips { margin-top: 10px; display: flex; flex-wrap: wrap; gap: 4px; }
.chips span { padding: 1px 7px; border: 1px solid var(--border); border-radius: 99px; background: var(--muted); color: var(--muted-foreground); font-size: 10px; }
.chips b { color: var(--foreground); font-family: var(--font-mono); font-weight: 500; }
.route { margin-top: 6px; color: var(--muted-foreground); font-family: var(--font-mono); font-size: 10px; }
</style>
