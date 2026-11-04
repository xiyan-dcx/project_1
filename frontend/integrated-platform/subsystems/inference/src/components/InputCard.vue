<script setup lang="ts">
import { ref } from 'vue'
import VideoSelector from './VideoSelector.vue'
import MonitorPanel from './MonitorPanel.vue'
import DetectionDemoPanel from './DetectionDemoPanel.vue'

defineProps<{ videos: string[]; loadingVideos: boolean; submitting: boolean }>()
const emit = defineEmits<{
  submit: [payload: { videos: string[]; prompt: string }]
}>()
const selected = ref<string[]>([])
const prompt = ref('')
const monitorMode = ref<'demo' | 'live'>('live')

function submit() {
  const value = prompt.value.trim()
  if (value) emit('submit', { videos: [...selected.value], prompt: value })
}
</script>

<template>
  <section class="card input-card">
    <div class="card-body">
      <label class="field-label">视频</label>
      <VideoSelector v-model="selected" :options="videos" :loading="loadingVideos" />
      <div class="monitor-switch" role="group" aria-label="视频预览模式">
        <button type="button" :aria-pressed="monitorMode === 'demo'" @click="monitorMode = 'demo'">YOLO 测试视频</button>
        <button type="button" :aria-pressed="monitorMode === 'live'" @click="monitorMode = 'live'">实时监控</button>
      </div>
      <DetectionDemoPanel v-if="monitorMode === 'demo'" />
      <MonitorPanel v-else :submitting="submitting" :prompt="prompt" />
      <div class="divider"></div>
      <label class="field-label" for="prompt">问题</label>
      <textarea id="prompt" v-model="prompt" placeholder="请输入你想了解的内容…" @keydown.ctrl.enter.prevent="submit" @keydown.meta.enter.prevent="submit" />
    </div>
    <div class="card-footer">
      <button class="submit" type="button" :disabled="submitting || !prompt.trim()" @click="submit">
        <svg viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
        {{ submitting ? '处理中…' : '发送' }}
      </button>
    </div>
  </section>
</template>

<style scoped>
.input-card { overflow: visible; }
.monitor-switch { display: flex; padding: 3px; margin-top: 16px; gap: 3px; border: 1px solid var(--border); border-radius: 8px; background: var(--muted); }
.monitor-switch button { flex: 1; padding: 6px 5px; border: 0; border-radius: 5px; background: transparent; color: var(--muted-foreground); font: inherit; font-size: 11px; cursor: pointer; }
.monitor-switch button[aria-pressed='true'] { background: var(--background, #fff); color: var(--foreground); box-shadow: 0 1px 3px #0000000c; }
.field-label { margin-bottom: 6px; display: block; font-size: 12px; font-weight: 500; }
.divider { margin: 10px 0; display: flex; align-items: center; gap: 10px; color: var(--muted-foreground); font-size: 11px; letter-spacing: .06em; text-transform: uppercase; }
.divider::before, .divider::after { content: ''; height: 1px; flex: 1; background: var(--border); }
textarea { width: 100%; height: 88px; padding: 9px 11px; resize: none; border: 1px solid var(--border); border-radius: 8px; background: transparent; color: var(--foreground); font: inherit; font-size: 13px; line-height: 1.65; outline: none; }
textarea:focus { border-color: #a0a0a0; box-shadow: 0 0 0 3px var(--ring); }
.submit { width: 100%; height: 36px; display: inline-flex; align-items: center; justify-content: center; gap: 6px; border: 0; border-radius: 8px; background: var(--primary); color: var(--primary-foreground); font: inherit; font-size: 13px; font-weight: 500; cursor: pointer; }
.submit:hover { background: #333; }
.submit:disabled { opacity: .45; cursor: not-allowed; }
.submit svg { width: 13px; fill: none; stroke: currentColor; stroke-width: 2; }
</style>
