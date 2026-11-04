<script setup lang="ts">
import { nextTick, watch } from 'vue'
import ResultCard from './ResultCard.vue'
import type { InferenceResult } from '@/types/inference'

const props = defineProps<{ results: InferenceResult[] }>()
watch(() => props.results.length, async () => {
  await nextTick()
  document.querySelector('.result-card:last-child')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
})
</script>

<template>
  <template v-if="results.length">
    <div class="results-header">
      <span>推理结果</span>
      <span>{{ results.length }} 条</span>
    </div>
    <div class="results-list">
      <ResultCard v-for="result in results" :key="result.id" :result="result" />
    </div>
  </template>
</template>

<style scoped>
.results-header { display: flex; align-items: center; justify-content: space-between; color: var(--muted-foreground); font-size: 10px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; }
.results-header span:last-child { font-family: var(--font-mono); font-weight: 400; letter-spacing: normal; text-transform: none; }
.results-list { display: flex; flex-direction: column; gap: 12px; }
</style>
