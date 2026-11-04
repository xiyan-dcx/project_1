<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import Hls from 'hls.js'
import { analysisStreamUrl, getLiveAnalysis, getMonitor, monitorStreamUrl, startLiveAnalysis,
  stopLiveAnalysis, type LiveAnalysisStatus, type MonitorEvent } from '@/api/monitor'

const props = defineProps<{ submitting: boolean; prompt: string }>()
const videoRef = ref<HTMLVideoElement | null>(null)
const previewRef = ref<HTMLDivElement | null>(null)
const analysis = ref<LiveAnalysisStatus | null>(null)
const loading = ref(true)
const playing = ref(false)
const error = ref('')
const actionError = ref('')
const statusError = ref('')
const changing = ref(false)
const running = computed(() => analysis.value?.running ?? false)
const sourceKey = computed(() => running.value
  ? `${analysis.value?.run_id}-${analysis.value?.latest?.camera_epoch ?? 0}` : 'raw')
const latestTracks = computed(() => analysis.value?.latest?.detections ?? [])
const events = computed(() => analysis.value?.events ?? [])
const offline = computed(() => running.value && ['offline', 'error'].includes(analysis.value?.state ?? ''))
const stateText = computed(() => {
  if (!running.value) return '未启动分析'
  if (offline.value) return '等待摄像头'
  if (analysis.value?.state === 'connecting') return '正在连接'
  if (analysis.value?.model_busy) return '正在分析片段'
  if (analysis.value?.pending_event) return '正在收集画面'
  return '人员检测中'
})
let active = true
let generation = 0
let hls: Hls | undefined
let retryTimer: ReturnType<typeof setTimeout> | undefined
let statusTimer: ReturnType<typeof setTimeout> | undefined
let watchdog: ReturnType<typeof setInterval> | undefined
let lastProgress = 0
let statusRevision = 0

function stopPlayer() {
  hls?.destroy()
  hls = undefined
  const video = videoRef.value
  if (video) {
    video.pause()
    video.removeAttribute('src')
    video.load()
  }
  playing.value = false
  clearInterval(watchdog)
  watchdog = undefined
}

function retry(message: string) {
  if (!active || document.hidden) return
  const token = ++generation
  stopPlayer()
  error.value = message
  loading.value = false
  clearTimeout(retryTimer)
  retryTimer = setTimeout(() => {
    if (active && token === generation) void load()
  }, 2000)
}

function onPlaying() {
  playing.value = true
  loading.value = false
  error.value = ''
  lastProgress = Date.now()
}

function onVideoError() {
  if (active && videoRef.value?.currentSrc && !error.value) retry('视频连接中断，正在自动重连…')
}

async function load() {
  if (!active || document.hidden) return
  const token = ++generation
  clearTimeout(retryTimer)
  stopPlayer()
  loading.value = true
  error.value = ''
  if (offline.value) {
    loading.value = false
    error.value = analysis.value?.error || '摄像头离线，等待自动重连…'
    return
  }
  try {
    const status = await getMonitor()
    if (!active || token !== generation) return
    if (!status.configured || !status.stream_supported) {
      retry(!status.configured ? '摄像头尚未配置' : '服务器视频服务暂不可用')
      return
    }
    const video = videoRef.value
    if (!video) return
    const url = running.value ? `${analysisStreamUrl()}?session=${encodeURIComponent(sourceKey.value)}` : monitorStreamUrl()
    if (Hls.isSupported()) {
      hls = new Hls({ liveSyncDurationCount: 2, liveMaxLatencyDurationCount: 5, maxBufferLength: 6 })
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal && token === generation) retry('视频正在连接，稍后自动重试…')
      })
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (token === generation) void video.play().catch(() => retry('视频播放失败，正在重试…'))
      })
      hls.loadSource(url)
      hls.attachMedia(video)
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = url
      void video.play().catch(() => retry('视频播放失败，正在重试…'))
    } else {
      error.value = '当前浏览器不支持 HLS 视频播放'
      loading.value = false
      return
    }
    lastProgress = Date.now()
    watchdog = setInterval(() => {
      if (playing.value && !video.paused && Date.now() - lastProgress > 10000) retry('画面停滞，正在自动重连…')
    }, 3000)
  } catch {
    if (active && token === generation) retry('监控加载失败，正在重试…')
  }
}

async function refreshStatus(reload = true) {
  const revision = statusRevision
  try {
    const next = await getLiveAnalysis()
    if (!active || revision !== statusRevision) return
    const previousKey = sourceKey.value
    analysis.value = next
    statusError.value = ''
    if (offline.value) {
      generation++
      clearTimeout(retryTimer)
      stopPlayer()
      loading.value = false
      error.value = next.error || '摄像头离线，等待自动重连…'
    } else if (reload && previousKey !== sourceKey.value) void load()
  } catch {
    if (active) statusError.value = '状态更新失败，正在重试…'
  } finally {
    if (active) statusTimer = setTimeout(() => { void refreshStatus() }, 1000)
  }
}

async function changeAnalysis() {
  statusRevision++
  changing.value = true
  actionError.value = ''
  try {
    const next = running.value ? await stopLiveAnalysis() : await startLiveAnalysis(props.prompt)
    if (!active) return
    analysis.value = next
    void load()
  } catch (cause) {
    let message = cause instanceof Error ? cause.message : '监控操作失败'
    try { message = JSON.parse(message).detail || message } catch { /* Plain network error. */ }
    if (active) actionError.value = message
  } finally {
    changing.value = false
  }
}

function timeLabel(seconds: number) {
  return new Date(seconds * 1000).toLocaleTimeString('zh-CN', { hour12: false })
}
function eventLabel(state: MonitorEvent['state']) {
  return { queued: '待分析', analyzing: '分析中', done: '已完成', error: '失败', cancelled: '已取消', skipped: '已跳过' }[state]
}
function plain(text: string) { return text.replace(/\*\*/g, '') }
function fullscreen() { void previewRef.value?.requestFullscreen?.().catch(() => {}) }
function onVisibilityChange() {
  if (document.hidden) {
    generation++
    clearTimeout(retryTimer)
    stopPlayer()
  } else void load()
}

onMounted(() => {
  document.addEventListener('visibilitychange', onVisibilityChange)
  void refreshStatus(false).finally(() => { void load() })
})
onBeforeUnmount(() => {
  active = false
  generation++
  clearTimeout(retryTimer)
  clearTimeout(statusTimer)
  stopPlayer()
  document.removeEventListener('visibilitychange', onVisibilityChange)
})
</script>

<template>
  <section class="monitor" aria-label="实时监控">
    <div class="monitor-heading">
      <span>实时监控</span>
      <span class="badge" :class="{ live: playing && !offline }">{{ playing && !offline ? (running ? 'AI 监控' : '实时视频') : '连接中' }}</span>
    </div>
    <div ref="previewRef" class="preview" @dblclick="fullscreen">
      <video ref="videoRef" autoplay muted playsinline aria-label="摄像头实时监控视频"
        @playing="onPlaying" @timeupdate="lastProgress = Date.now()" @error="onVideoError" />
      <div v-if="loading && !playing && !error" class="placeholder" role="status">正在加载实时视频…</div>
      <div v-else-if="error" class="placeholder" role="alert"><span>{{ error }}</span><button type="button" @click="load">重新加载</button></div>
      <button v-if="playing" class="fullscreen" type="button" aria-label="全屏监控视频" @click="fullscreen">全屏</button>
    </div>
    <div class="monitor-info">
      <div><p>{{ stateText }}</p><small v-if="running">最新检测 {{ analysis?.person_count ?? 0 }} 人 · {{ analysis?.detection_fps ?? 0 }} 帧/秒</small>
        <small v-else>可在下方填写关注点后启动 AI。</small></div>
      <button class="analyze-monitor" type="button" :disabled="changing || (!running && !analysis?.supported)" @click="changeAnalysis">
        {{ changing ? '处理中…' : running ? '停止 AI 分析' : '启动 AI 分析' }}
      </button>
    </div>
    <p v-if="actionError || statusError" class="notice" role="alert">{{ actionError || statusError }}</p>
    <template v-if="running">
      <p class="hint">检测框随视频同步；最多 {{ analysis?.window_seconds ?? 6 }} 秒画面用于分析，持续有人时至少间隔 {{ analysis?.cooldown_seconds }} 秒再次分析。任务持续运行，需点击停止。</p>
      <p v-if="latestTracks.length" class="tracks">最新轨迹：{{ latestTracks.map(item => `#${item.track_id}`).join('、') }}</p>
    </template>
    <div v-if="running || events.length" class="event-area">
      <div class="event-heading"><span>分析事件</span><small>按采集时间记录</small></div>
      <p v-if="!events.length" class="empty">{{ running ? '检测到人员后自动采集画面并分析，结果将在这里显示。' : '暂无分析事件。' }}</p>
      <div class="events">
        <details v-for="(event, index) in events" :key="event.id" class="event" :open="index === 0">
          <summary><span>{{ timeLabel(event.start_at) }}–{{ timeLabel(event.end_at) }}</span><span class="event-state" :class="event.state">{{ eventLabel(event.state) }}</span></summary>
          <p class="event-tracks">轨迹 {{ event.track_ids.map(id => `#${id}`).join('、') || '—' }}<span v-if="event.latency_seconds"> · 分析耗时 {{ event.latency_seconds }} 秒</span></p>
          <p v-if="event.summary" class="answer">{{ plain(event.summary) }}</p>
          <ul v-if="event.visible_facts?.length"><li v-for="fact in event.visible_facts" :key="fact">{{ fact }}</li></ul>
          <p v-if="event.uncertainties?.length" class="uncertainty">不能确定：{{ event.uncertainties.join('；') }}</p>
          <p v-if="event.error" class="notice">{{ event.error }}</p>
          <p v-else-if="event.state === 'queued' || event.state === 'analyzing'" class="empty">{{ event.state === 'queued' ? '等待模型处理…' : '模型正在分析这段时间的画面…' }}</p>
        </details>
      </div>
      <small class="result-hint">模型描述需结合画面核对；轨迹编号仅用于本次跟踪。</small>
    </div>
  </section>
</template>

<style scoped>
.monitor { margin-top: 12px; }
.monitor-heading,.event-heading { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; gap: 8px; font-size: 12px; font-weight: 500; }
.badge { padding: 3px 7px; border: 1px solid var(--border); border-radius: 6px; background: var(--muted); color: var(--muted-foreground); font-size: 10px; font-weight: 400; }
.badge.live { color: #16834a; border-color: #a7dfbe; background: #effaf3; }
.preview { position: relative; width: 100%; aspect-ratio: 16 / 9; overflow: hidden; border: 1px solid var(--border); border-radius: 8px; background: #111; }
.preview:fullscreen { border: 0; border-radius: 0; aspect-ratio: auto; }
video { display: block; width: 100%; height: 100%; object-fit: contain; }
.fullscreen { position: absolute; right: 8px; bottom: 8px; border: 1px solid #ffffff55; border-radius: 5px; background: #111a; color: #fff; padding: 4px 7px; font-size: 10px; cursor: pointer; }
.placeholder { position: absolute; inset: 0; background: #111; display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 12px; color: #ddd; font-size: 12px; padding: 12px; text-align: center; }
.placeholder button { padding: 5px 10px; cursor: pointer; }
.monitor-info { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 10px; }
.monitor-info p { margin: 0 0 4px; font-size: 12px; }
small,.hint,.tracks,.notice,.empty { font-size: 11px; line-height: 1.7; color: var(--muted-foreground); }
.hint { margin: 8px 0 0; }
.tracks { margin: 5px 0; }
.analyze-monitor { flex-shrink: 0; padding: 8px 10px; border: 1px solid var(--border); border-radius: 7px; background: var(--primary); color: var(--primary-foreground); font: inherit; font-size: 11px; cursor: pointer; }
.analyze-monitor:disabled { opacity: .45; cursor: not-allowed; }
.notice { margin: 7px 0; }
.event-area { margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border); }
.event-heading small { font-size: 10px; font-weight: 400; }
.events { max-height: 340px; overflow-y: auto; }
.event { padding: 9px 10px; margin-bottom: 7px; border: 1px solid var(--border); border-radius: 7px; background: var(--muted); }
summary { display: flex; align-items: center; justify-content: space-between; gap: 8px; cursor: pointer; font-size: 11px; }
.event-state { font-size: 10px; color: var(--muted-foreground); }
.event-state.done { color: #16834a; }
.event-tracks { margin: 7px 0; font-size: 10px; color: var(--muted-foreground); line-height: 1.6; }
.answer,.event ul { margin: 7px 0; font-size: 11px; line-height: 1.8; white-space: pre-wrap; overflow-wrap: anywhere; }
.event ul { padding-left: 17px; }
.uncertainty { margin: 7px 0; font-size: 10px; line-height: 1.7; color: var(--muted-foreground); }
.result-hint { display: block; font-size: 10px; }
@media (max-width: 400px) { .monitor-info { gap: 8px; } }
</style>
