<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, reactive, ref } from 'vue'
import MetricChart from './components/MetricChart.vue'
import CaaSComparison from './components/CaaSComparison.vue'
import { connectDashboardSocket, getState, health, isSample, runBenchmark, type RemoteStatus } from './api/dashboard'
import { CHARTS, ENGINES, chartOptions, color, envKey, format, groupEnvironments, percentile, streamOptions, upsert, type Point } from './domain/dashboard'
import type { BenchStatus, EngineKey, RW, Sample } from './types/bench'

const demo = import.meta.env.DEV && new URLSearchParams(location.search).get('demo') === '1'
const form = reactive({engine: null as EngineKey | null, rw: 'write' as RW, bs: '64k', qd: 32, rt: 2})
const rws: {key: RW; label: string}[] = [{key:'write',label:'顺序写'},{key:'randwrite',label:'随机写'},{key:'read',label:'顺序读'},{key:'randread',label:'随机读'}]
const samples = ref<Sample[]>([])
const selectedKey = ref('')
const groups = computed(() => groupEnvironments(samples.value))
const selected = computed(() => groups.value.find(g => g.key === selectedKey.value))
const rows = computed(() => selected.value?.rows || [])
const panels = computed(() => CHARTS.map(c => ({...c, option: chartOptions(c.key, rows.value)})))
const status = ref<BenchStatus>('idle')
const statusMsg = ref('准备就绪')
const runEnabled = ref(false)
const remote = ref<RemoteStatus>()
const timestamp = (value: number | null) => value ? new Date(value * 1000).toLocaleString() : '尚未收到'
const submitting = ref(false)
const healthText = ref(demo ? '合成数据演示' : '检查中')
const connection = ref(demo ? '未连接真实接口' : '连接中')
const stream = reactive({visible: false, running: false, engine: 'scalaafa' as EngineKey, title: '实时性能曲线', subtitle: '', points: [] as Point[]})
const liveOption = computed(() => streamOptions(stream.points, stream.engine))
let socket: WebSocket | undefined
let reconnect: ReturnType<typeof setTimeout> | undefined
let replay: ReturnType<typeof setInterval> | undefined
let disposed = false

function selectEnvironment(key: string) {
  selectedKey.value = key
  // Do not replace an in-progress stream when browsing saved configurations.
  if (stream.running) return
  const s = groups.value.find(g => g.key === key)?.rows.find(r => r.series?.length)
  if (s) {
    stream.visible = true
    stream.engine = s.engine
    stream.title = `已保存性能曲线 — ${s.engine_name} · ${s.rw} · ${s.bs} · QD${s.qd}`
    stream.points = s.series!
    stream.subtitle = `${demo ? '合成数据 · ' : ''}${s.series!.length} 个数据点`
  } else { stream.visible = false; stream.points = [] }
}
function handleMessage(message: Record<string, unknown>) {
  if (message.remote) {
    remote.value = message.remote as RemoteStatus
    if (!remote.value.connected) {
      stream.running = false
      stream.subtitle = '远端连接中断；保留数据不是当前实时数据'
    }
  }
  if (message.type === 'state') {
    const payload = message as unknown as {status: {state: BenchStatus; msg: string}; samples: Sample[]}
    status.value = payload.status.state
    statusMsg.value = payload.status.msg || '准备就绪'
    samples.value = payload.samples || []
    if (remote.value && !selectedKey.value && samples.value.length) selectEnvironment(envKey(samples.value[0]))
  } else if (message.type === 'status') {
    const s = message.status as {state: BenchStatus; msg: string}
    status.value = s.state; statusMsg.value = s.msg || '准备就绪'
  } else if (message.type === 'sample' && isSample(message.sample)) {
    samples.value = upsert(samples.value, message.sample)
    if (remote.value && !selectedKey.value) selectedKey.value = envKey(message.sample)
  } else if (message.type === 'stream_start') {
    stream.visible = true; stream.running = true; stream.points = []
    stream.engine = message.engine as EngineKey
    const name = message.engine_name || ENGINES.find(e => e.key === stream.engine)?.name
    stream.title = `实时性能曲线 — ${name} · ${message.rw} · ${message.bs} · QD${message.qd}`
    stream.subtitle = '运行中 (0s)'
  } else if (message.type === 'stream_point') {
    if (typeof message.t !== 'number' || typeof message.iops !== 'number' || typeof message.bw_mib !== 'number') return
    stream.points.push({t:message.t, iops:message.iops, bw_mib:message.bw_mib})
    stream.subtitle = `运行中 (${message.t}s) · 当前 ${message.iops.toLocaleString()} IOPS / ${message.bw_mib} MiB/s`
  } else if (message.type === 'stream_end') {
    stream.running = false
    stream.subtitle = `${status.value === 'failed' ? '测试失败' : '✓ 已完成'} (${stream.points.length} 个数据点)`
  }
}
async function checkHealth() {
  try {
    const result = await health()
    if (disposed) return
    runEnabled.value = result.ok && result.run_enabled
    if (result.remote) remote.value = result.remote
    healthText.value = result.ok ? '独立引擎 API 正常' : 'API 不可用'
  } catch { runEnabled.value = false; healthText.value = '后端未启动' }
}
function connect() {
  if (disposed || demo) return
  socket = connectDashboardSocket(handleMessage)
  socket.onopen = () => { connection.value = '已连接'; void checkHealth() }
  socket.onerror = () => { connection.value = '连接异常' }
  socket.onclose = () => {
    runEnabled.value = false
    if (disposed) return
    connection.value = '已断开，2秒后重连'
    if (remote.value) remote.value = {...remote.value, connected:false, snapshot_stale:true, transport_error:'本地适配连接中断，远端状态待重验'}
    reconnect = setTimeout(connect, 2000)
  }
}
async function startRun() {
  if (demo || !runEnabled.value || submitting.value || status.value === 'running' || status.value === 'preparing') return
  if (!form.engine) { statusMsg.value = '请先选择引擎'; return }
  if (form.engine === 'raid5f' && form.bs !== '256k') { status.value = 'failed'; statusMsg.value = 'RAID5F 只允许 256k'; return }
  submitting.value = true
  try {
    const request = {...form, engine: form.engine}
    const result = await runBenchmark(request)
    if (!result.ok) throw new Error(result.err || '提交失败')
    selectedKey.value = envKey(request)
  } catch (error) { status.value = 'failed'; statusMsg.value = error instanceof Error ? error.message : '提交失败' }
  finally { submitting.value = false }
}
function replayDemo() {
  if (!demo || stream.running) return
  const s = rows.value[0]
  if (!s?.series) return
  handleMessage({type:'stream_start', ...s})
  let index = 0
  replay = setInterval(() => {
    handleMessage({type:'stream_point', ...s.series![index++]})
    if (index === s.series!.length) { clearInterval(replay); handleMessage({type:'stream_end'}) }
  }, 400)
}
onMounted(async () => {
  if (demo) {
    const {demoSamples} = await import('./dev/fixtures')
    if (disposed) return
    samples.value = demoSamples
    selectEnvironment(envKey(demoSamples[0]))
    return
  }
  await checkHealth()
  try { const state = await getState(); if (!disposed) handleMessage(state as unknown as Record<string,unknown>) } catch { /* WS snapshot retries */ }
  connect()
})
onBeforeUnmount(() => { disposed = true; clearTimeout(reconnect); clearInterval(replay); socket?.close() })
</script>

<template>
  <main class="page-shell">
    <header class="header glass">
      <h1>⚡ ScalaAFA 整合系统 · 存算优化看板</h1>
      <div class="header-status"><span class="status" :class="status">{{ statusMsg }}</span>
        <small>后端：{{ healthText }} · 实时通道：{{ connection }}</small>
      </div>
    </header>
    <div v-if="demo" class="preview-notice" role="status">
      界面验收演示：全部为合成数据，不是实验结果，不连接真实接口。
      <button class="btn" :disabled="stream.running" @click="replayDemo">回放合成实时曲线</button>
    </div>
    <section v-else-if="remote" class="preview-notice remote-status" aria-label="远端只读状态" aria-live="polite">
      <strong>服务器只读接入 · {{ remote.source }} · 禁止提交测试</strong>
      <div>远端 API：{{ remote.api_ok ? '可达' : '不可达/待确认' }} · 远端 WebSocket：{{ remote.connected ? '已连接' : '未连接，自动重试' }} · 下游健康检查：{{ remote.downstream_ok ? '通过（不代表已验证设备可写）' : '未通过/待确认' }}</div>
      <div v-if="remote.downstream_error">下游返回：{{ remote.downstream_error }}</div>
      <div v-if="remote.api_error">API 检查：{{ remote.api_error }}</div>
      <div v-if="remote.transport_error">状态通道：{{ remote.transport_error }}</div>
      <div>最近健康检查：{{ timestamp(remote.checked_at) }} · 最近远端消息：{{ timestamp(remote.last_message_at) }}</div>
      <div v-if="remote.snapshot_stale">远端快照已过期，保留结果不能视为当前实时数据。</div>
      <div v-if="remote.unsupported_samples">另有 {{ remote.unsupported_samples }} 个非三引擎/不兼容样本未展示，不混入本模块比较。</div>
    </section>
    <CaaSComparison v-if="!demo && !remote" />
    <div v-if="!demo && !remote && !runEnabled" class="preview-notice">独立三引擎测试入口当前禁用；上方整合系统对比可独立使用。旧 API 正常不代表隔离 FEMU/SSH 环境可写。</div>
    <h2 class="diagnostic-title">独立引擎诊断与隔离回归</h2>
    <p class="diagnostic-note">以下 ScalaAFA / mdraid / RAID5F 为独立基准入口，不等同于上方 CaaS-LSM + 在线 dPP 的正式整合系统对比。未配置的引擎请勿用于正式结论。</p>
    <section class="layout">
      <aside class="sidebar glass">
        <div class="section"><div class="section-title">引擎</div><div class="btn-group">
          <button v-for="e in ENGINES" :key="e.key" class="btn" :class="[e.key, {active:form.engine===e.key}]" :aria-pressed="form.engine===e.key" @click="form.engine=e.key">{{ e.name }}</button>
        </div></div>
        <div class="section"><div class="section-title">读写模式</div><div class="btn-group">
          <button v-for="r in rws" :key="r.key" class="btn" :class="{active:form.rw===r.key}" :aria-pressed="form.rw===r.key" @click="form.rw=r.key">{{ r.label }}</button>
        </div></div>
        <div class="section"><div class="section-title">块大小</div><div class="btn-group">
          <button v-for="bs in ['4k','16k','32k','64k','128k','256k']" :key="bs" class="btn" :class="{active:form.bs===bs}" :aria-pressed="form.bs===bs" @click="form.bs=bs">{{ bs }}</button>
        </div></div>
        <div class="section"><div class="section-title">队列深度</div><div class="btn-group">
          <button v-for="qd in [1,8,32,64]" :key="qd" class="btn" :class="{active:form.qd===qd}" :aria-pressed="form.qd===qd" @click="form.qd=qd">{{ qd }}</button>
        </div></div>
        <div class="section"><div class="section-title">运行时间</div><div class="btn-group">
          <button v-for="rt in [2,5,10,30]" :key="rt" class="btn" :class="{active:form.rt===rt}" :aria-pressed="form.rt===rt" @click="form.rt=rt">{{ rt }}s</button>
        </div></div>
        <button class="run-btn" :disabled="demo || !runEnabled || submitting || connection!=='已连接' || status==='preparing' || status==='running'" @click="startRun">{{ !runEnabled ? '预览模式 · 压测禁用' : submitting ? '提交中…' : '▶ 开始测试' }}</button>
        <div class="section environment-section"><div class="section-title">测试环境</div>
          <div v-if="!groups.length" class="env-empty">完成测试后，环境组合会显示在这里。</div>
          <div class="env-list"><button v-for="g in groups" :key="g.key" class="env-item" :class="{active:selectedKey===g.key}" @click="selectEnvironment(g.key)">
            <span class="env-config">{{ g.rw }} · {{ g.bs }} · QD{{ g.qd }} · {{ g.rt }}s</span>
            <span class="env-engines"><i v-for="s in g.rows" :key="s.engine" class="engine-badge" :class="s.engine">{{ s.engine_name }}</i></span>
          </button></div>
        </div>
      </aside>
      <section class="main glass">
        <section v-if="stream.visible" class="stream-box">
          <div class="chart-title">🔴 {{ stream.title }}<span>{{ stream.subtitle }}</span></div>
          <MetricChart :option="liveOption" label="实时 IOPS 与带宽双轴曲线" />
        </section>
        <div v-if="!rows.length" class="empty-state"><div class="empty-state-icon">🚀</div>
          <h3>{{ remote ? '等待服务器已有结果' : '选择参数，开始测试' }}</h3>
          <p>{{ remote ? '这里只接收服务器推送，不发起压测；空白不代表 IOPS 为零。' : '配置完成后点击“开始测试”，同配置的多引擎结果会自动汇集到一起。' }}</p>
          <p v-if="groups.length">点击左侧“测试环境”查看已有结果。</p>
        </div>
        <template v-else>
          <div class="metrics-grid"><article v-for="s in rows" :key="s.engine" class="metric-card" :style="{'--accent':color(s.engine)}">
            <div class="metric-label" :style="{color:color(s.engine)}">{{ s.engine_name }}</div>
            <div class="metric-value">{{ s.iops.toLocaleString() }}<span class="metric-unit">IOPS</span></div>
            <div class="metric-sub">{{ s.bw_mib }} MiB/s · {{ format(s.lat_us,0) }} µs · QD{{ s.qd }}</div>
          </article></div>
          <div class="charts-grid"><article v-for="panel in panels" :key="panel.key" class="chart-box" :class="'col-'+panel.col">
            <div class="chart-title">{{ panel.title }}<span>{{ panel.subtitle }}</span></div>
            <MetricChart :option="panel.option" :label="panel.title" :tall="'tall' in panel && panel.tall" />
            <small v-if="panel.key==='depth'" class="chart-note">来源：{{ rows[0].engine_name }}（与原版一致，取当前环境首个引擎）</small>
            <small v-if="panel.key==='radar'" class="chart-note">同配置内相对归一化，分值不是绝对性能；稳定性轴取延迟标准差。</small>
          </article></div>
          <div class="table-wrap"><table><thead><tr><th>引擎</th><th>IOPS</th><th>带宽 MiB/s</th><th>平均延迟µs</th><th>最小µs</th><th>最大µs</th><th>标准差</th><th>CPU 用户</th><th>P99</th><th>P99.9</th></tr></thead>
            <tbody><tr v-for="s in rows" :key="s.engine"><td class="engine-cell"><i class="engine-dot" :style="{background:color(s.engine)}" />{{ s.engine_name }}</td>
              <td>{{ s.iops.toLocaleString() }}</td><td>{{ s.bw_mib }}</td><td>{{ format(s.lat_us) }}</td><td>{{ format(s.lat_min) }}</td><td>{{ format(s.lat_max,0) }}</td>
              <td>{{ format(s.lat_stdev) }}</td><td>{{ s.cpu?.usr == null ? '—' : format(s.cpu.usr)+'%' }}</td><td>{{ format(percentile(s,99),0) }}</td><td>{{ format(percentile(s,99.9),0) }}</td>
            </tr></tbody></table></div>
        </template>
      </section>
    </section>
  </main>
</template>
