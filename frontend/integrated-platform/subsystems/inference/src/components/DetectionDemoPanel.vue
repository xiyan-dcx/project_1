<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { getMonitorDemo, monitorDemoVideoUrl, type MonitorDemo } from '@/api/monitor'

const demo = ref<MonitorDemo | null>(null)
const error = ref('')
const personCount = ref(0)
const videoRef = ref<HTMLVideoElement | null>(null)
const analysisText = computed(() => (demo.value?.analysis.answer ?? '').replace(/\*\*/g, '').replace(/^#{1,6}\s+/gm, ''))
let active = true

async function load() {
  error.value = ''
  try {
    const result = await getMonitorDemo()
    if (active) {
      demo.value = result
      personCount.value = result.timeline[0]?.person_count ?? 0
      await nextTick()
      if (active && videoRef.value) {
        videoRef.value.load()
        void videoRef.value.play().catch(() => { /* Native controls allow manual playback. */ })
      }
    }
  } catch {
    if (active) error.value = '测试视频暂时无法加载，请稍后重试。'
  }
}

function updateCount() {
  const timeline = demo.value?.timeline
  if (!timeline?.length) return
  const current = videoRef.value?.currentTime ?? 0
  let count = timeline[0]?.person_count ?? 0
  for (const item of timeline) {
    if (item.time > current) break
    count = item.person_count
  }
  personCount.value = count
}

onMounted(load)
onBeforeUnmount(() => {
  active = false
  videoRef.value?.pause()
})
</script>

<template>
  <section class="demo" aria-label="YOLO 测试视频">
    <div class="heading"><span>{{ demo?.title || '人员检测演示' }}</span><span class="badge">录像测试 · 非实时</span></div>
    <template v-if="demo">
      <p class="source-name">测试素材：{{ demo.filename }}</p>
      <div class="preview" :style="{ aspectRatio: `${demo.width} / ${demo.height}` }">
        <video ref="videoRef" :src="monitorDemoVideoUrl(demo.generated_at)" autoplay muted loop playsinline controls
          preload="metadata" aria-label="带 YOLO 人员检测框的测试录像"
          @timeupdate="updateCount" @seeked="updateCount" @error="error = '视频播放失败，请重新加载。'" />
      </div>
      <div class="stats"><span>{{ demo.model }} · {{ demo.device }}</span><span>当前 {{ personCount }} 人</span><span>{{ demo.duration }} 秒</span></div>
      <p class="hint">绿色框为逐帧检测结果。此视频为预先处理的录像，可拖动进度查看。</p>
      <details class="analysis">
        <summary>查看采样画面的大模型分析 <span v-if="demo.analysis.latency_seconds">{{ demo.analysis.latency_seconds }} 秒</span></summary>
        <p v-if="demo.analysis.status === 'done'">{{ analysisText }}</p>
        <p v-else>{{ demo.analysis.message || '本次分析暂不可用。' }}</p>
        <small>基于全景与人员局部采样生成，不是连续实时分析。</small>
      </details>
    </template>
    <div v-else-if="!error" class="placeholder" role="status">正在加载测试视频…</div>
    <div v-if="error" class="error" role="alert">{{ error }} <button type="button" @click="load">重新加载</button></div>
  </section>
</template>

<style scoped>
.demo { margin-top: 12px; }
.heading { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; font-size: 12px; font-weight: 500; gap: 8px; }
.badge { padding: 3px 7px; border: 1px solid var(--border); border-radius: 6px; background: var(--muted); color: var(--muted-foreground); font-size: 10px; font-weight: 400; }
.preview { aspect-ratio: 16 / 9; overflow: hidden; border: 1px solid var(--border); border-radius: 8px; background: #111; }
.source-name { margin: 0 0 8px; color: var(--muted-foreground); font-size: 11px; overflow-wrap: anywhere; }
video { display: block; width: 100%; height: 100%; object-fit: contain; }
.stats { display: flex; justify-content: space-between; gap: 8px; margin-top: 9px; font-size: 11px; color: var(--foreground); }
.hint { margin: 6px 0 10px; font-size: 11px; color: var(--muted-foreground); line-height: 1.7; }
.analysis { padding: 9px 10px; border: 1px solid var(--border); border-radius: 7px; background: var(--muted); font-size: 11px; }
summary { cursor: pointer; line-height: 1.6; }
summary span { margin-left: 5px; color: var(--muted-foreground); }
.analysis p { white-space: pre-wrap; line-height: 1.8; margin: 9px 0; }
small { display: block; font-size: 10px; color: var(--muted-foreground); line-height: 1.6; }
.placeholder { min-height: 120px; display: grid; place-items: center; border-radius: 8px; background: var(--muted); color: var(--muted-foreground); font-size: 12px; }
.error { margin-top: 8px; font-size: 11px; line-height: 1.7; color: var(--muted-foreground); }
.error button { border: 1px solid var(--border); border-radius: 5px; background: var(--background); color: var(--foreground); cursor: pointer; }
</style>
