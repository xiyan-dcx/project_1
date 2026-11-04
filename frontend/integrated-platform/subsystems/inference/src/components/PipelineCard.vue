<script setup lang="ts">
import { computed } from 'vue'
import PipelineStage from './PipelineStage.vue'
import type { PipelineState, StageName } from '@/types/inference'

const props = defineProps<{ pipeline: PipelineState }>()
const order: StageName[] = ['extract', 'assess', 'route']
const countLabel = computed(() => props.pipeline.total > 1
  ? `${props.pipeline.currentIndex} / ${props.pipeline.total}`
  : props.pipeline.currentFile)
</script>

<template>
  <section v-if="pipeline.visible" class="card">
    <div class="card-body">
      <div class="heading">
        <span class="section-label">{{ pipeline.mode === 'text' ? '文本对话' : '推理流水线' }}</span>
        <span v-if="pipeline.mode === 'video'" class="count">{{ countLabel }}</span>
      </div>

      <template v-if="pipeline.mode === 'video'">
        <div class="current-file">{{ pipeline.currentFile }}</div>
        <div class="pipeline">
          <template v-for="(name, index) in order" :key="name">
            <PipelineStage :stage="pipeline.stages[name]" />
            <div v-if="index < order.length - 1" class="connector" :class="{ filled: pipeline.stages[name].status === 'done' }"><i /></div>
          </template>
        </div>
        <div class="log"><i />{{ pipeline.log }}</div>
      </template>

      <div v-else class="text-loading">
        <i />
        <span>思考中…</span>
      </div>
    </div>
  </section>
</template>

<style scoped>
.heading { margin-bottom: 12px; display: flex; align-items: center; justify-content: space-between; }
.section-label { color: var(--muted-foreground); font-size: 10px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; }
.count { padding: 1px 7px; border: 1px solid var(--border); border-radius: 99px; background: var(--muted); color: var(--muted-foreground); font-family: var(--font-mono); font-size: 10px; }
.current-file { margin-bottom: 14px; padding: 5px 9px; overflow: hidden; border: 1px solid var(--border); border-radius: 6px; background: var(--muted); font-family: var(--font-mono); font-size: 11px; font-weight: 500; text-overflow: ellipsis; white-space: nowrap; }
.pipeline { margin-bottom: 10px; display: flex; align-items: flex-start; }
.connector { width: 28px; height: 24px; display: flex; align-items: center; flex: 0 0 auto; }
.connector::before { content: ''; width: 100%; height: 1.5px; background: var(--border); }
.connector.filled::before { background: var(--primary); transition: background .4s; }
.log { min-height: 32px; padding: 7px 10px; display: flex; align-items: center; gap: 6px; border: 1px solid var(--border); border-radius: 6px; background: var(--muted); color: var(--muted-foreground); font-family: var(--font-mono); font-size: 10px; }
.log i { width: 4px; height: 4px; flex: 0 0 auto; border-radius: 50%; background: var(--muted-foreground); }
.text-loading { padding: 4px 0; display: flex; align-items: center; gap: 8px; color: var(--muted-foreground); font-size: 12px; }
.text-loading i { width: 18px; height: 18px; border: 1.5px solid var(--border); border-top-color: var(--primary); border-radius: 50%; animation: spin .72s linear infinite; }
</style>
