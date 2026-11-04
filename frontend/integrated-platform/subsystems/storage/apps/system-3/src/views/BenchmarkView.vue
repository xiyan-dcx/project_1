<script setup lang="ts">
import { UiButton, UiCard, DataTable, PageLayout } from '@research-platform/design-system'
import { computed, onMounted, onBeforeUnmount, reactive, ref } from 'vue'
import MetricChart from '../components/MetricChart.vue'
import { environmentLabel } from '../domain/display'
import { connectDashboardSocket, getEngines, health, isSample, runBenchmark, type RemoteStatus } from '../api/dashboard'
import { benchmarkAllowed, CHARTS, chartOptions, color, envKey, format, groupEnvironments, percentile, streamOptions, upsert, type Point } from '../domain/dashboard'
import type { BenchStatus, EngineDescriptor, EngineKey, RW, Sample } from '../types/bench'

const demo = import.meta.env.DEV && new URLSearchParams(location.search).get('demo') === '1'
const form = reactive({engine: null as EngineKey | null, rw: 'write' as RW, bs: '64k', qd: 32, rt: 2})
const rws: {key: RW; label: string}[] = [{key:'write',label:'顺序写'},{key:'randwrite',label:'随机写'},{key:'read',label:'顺序读'},{key:'randread',label:'随机读'}]
const samples = ref<Sample[]>([])
const selectedKey = ref('')
const engineLabel = (key:string, fallback=key) => (({scalaafa:'ScalaAFA',dpp:'局部更新旧入口',raid5f:'RAID5F',mdraid:'Linux RAID5'} as Record<string,string>)[key] || environmentLabel(fallback))
const availableEngines = computed(() => engines.value.filter(e => e.key !== 'dpp'))
const groups = computed(() => groupEnvironments(samples.value.map(s => ({...s,engine_name:engineLabel(s.engine,s.engine_name)}))))
const selected = computed(() => groups.value.find(g => g.key === selectedKey.value))
const rows = computed(() => selected.value?.rows || [])
const panels = computed(() => CHARTS.map(c => ({...c, option: chartOptions(c.key, rows.value)})))
const status = ref<BenchStatus>('idle')
const statusMsg = ref('准备就绪')
const runEnabled = ref(false)
const runDisabledReason = ref('后端未显式允许独立压测')
const engines = ref<EngineDescriptor[]>([])
const engineLoadError = ref('')
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
    const name = message.engine_name || engines.value.find(e => e.key === stream.engine)?.name || stream.engine
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
    runEnabled.value = benchmarkAllowed(result)
    runDisabledReason.value = result.run_enabled_reason || '后端未明确返回 run_enabled: true'
    if (result.remote) remote.value = result.remote
    healthText.value = result.ok
      ? `API 正常 · 状态 ${result.state || '未知'} · 引擎模式 ${result.engine_mode || '未知'}`
      : 'API 不可用'
  } catch { runEnabled.value = false; healthText.value = '后端未启动' }
}
async function checkEngines() {
  try {
    engines.value = await getEngines()
    if (form.engine && !engines.value.some(engine => engine.key === form.engine && engine.runnable)) form.engine = null
  } catch (error) {
    engines.value = []
    engineLoadError.value = error instanceof Error ? error.message : '后端引擎清单不可用'
  }
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
    const {demoSamples} = await import('../dev/fixtures')
    if (disposed) return
    samples.value = demoSamples
    selectEnvironment(envKey(demoSamples[0]))
    return
  }
  await Promise.all([checkHealth(), checkEngines()])
  connect()
})
onBeforeUnmount(() => { disposed = true; clearTimeout(reconnect); clearInterval(replay); socket?.close() })
</script>

<template>
  <PageLayout class="page-shell">
    <template #heading>
    <header class="header" data-visual-region="page-heading">
      <h1>块存储诊断</h1>
      <div class="header-status"><span class="status" :class="status">{{ environmentLabel(statusMsg) }}</span>
        <small>后端：{{ healthText }} · 实时通道：{{ connection }}</small>
      </div>
    </header></template>
    <div v-if="demo" class="preview-notice" role="status">
      界面验收演示：全部为合成数据，不是实验结果，不连接真实接口。
      <UiButton class="btn" :disabled="stream.running" @click="replayDemo">回放合成实时曲线</UiButton>
    </div>
    <section v-else-if="remote" class="preview-notice remote-status" aria-label="远端只读状态" aria-live="polite">
      <strong>服务器只读接入 · {{ environmentLabel(remote.source) }} · 禁止提交测试</strong>
      <div>远端 API：{{ remote.api_ok ? '可达' : '不可达/待确认' }} · 远端 WebSocket：{{ remote.connected ? '已连接' : '未连接，自动重试' }} · 下游健康检查：{{ remote.downstream_ok ? '通过（不代表已验证设备可写）' : '未通过/待确认' }}</div>
      <div v-if="remote.downstream_error">下游返回：{{ environmentLabel(remote.downstream_error) }}</div>
      <div v-if="remote.api_error">API 检查：{{ environmentLabel(remote.api_error) }}</div>
      <div v-if="remote.transport_error">状态通道：{{ environmentLabel(remote.transport_error) }}</div>
      <div>最近健康检查：{{ timestamp(remote.checked_at) }} · 最近远端消息：{{ timestamp(remote.last_message_at) }}</div>
      <div v-if="remote.snapshot_stale">远端快照已过期，保留结果不能视为当前实时数据。</div>
      <div v-if="remote.unsupported_samples">另有 {{ remote.unsupported_samples }} 个非三引擎/不兼容样本未展示，不混入本模块比较。</div>
    </section>
    <div v-else-if="!runEnabled" class="preview-notice">安全预览：{{ environmentLabel(runDisabledReason) }}。API 正常不代表 SSH/SPDK 已连接。</div>
    <h2 class="diagnostic-title">历史回归与设备微基准</h2>
    <p class="diagnostic-note">用于块设备故障定位、历史回归和独立微基准；整套系统性能请查看主页面。历史结果使用不同设备环境，不混为同条件对照。</p>
    <section class="layout">
      <aside class="sidebar glass">
        <div class="section"><div class="section-title">引擎</div>
          <p v-if="engineLoadError" class="engine-error" role="status">{{ engineLoadError }}；独立压测入口已禁用。</p>
          <div class="btn-group">
            <UiButton v-for="e in availableEngines" :key="e.key" class="btn" :class="[e.key, {active:form.engine===e.key}]" :aria-pressed="form.engine===e.key" :disabled="!e.runnable" :title="environmentLabel(e.reason || `${e.mode} 引擎`)" @click="form.engine=e.key">{{ engineLabel(e.key,e.name) }}</UiButton>
          </div>
          <details class="engine-config"><summary>诊断入口与配置</summary><div v-for="e in engines" :key="e.key"><strong>{{engineLabel(e.key,e.name)}}</strong><p>{{environmentLabel(e.name)}}</p><small>{{e.key==='dpp'?'旧别名入口，缺少独立 dPP 开关，已从可选列表移除。':environmentLabel(e.reason) || (e.runnable?'当前可执行':'当前不可执行')}}</small></div></details>
        </div>
        <div class="section"><div class="section-title">读写模式</div><div class="btn-group">
          <UiButton v-for="r in rws" :key="r.key" class="btn" :class="{active:form.rw===r.key}" :aria-pressed="form.rw===r.key" @click="form.rw=r.key">{{ r.label }}</UiButton>
        </div></div>
        <div class="section"><div class="section-title">块大小</div><div class="btn-group">
          <UiButton v-for="bs in ['4k','16k','32k','64k','128k','256k']" :key="bs" class="btn" :class="{active:form.bs===bs}" :aria-pressed="form.bs===bs" @click="form.bs=bs">{{ bs }}</UiButton>
        </div></div>
        <div class="section"><div class="section-title">队列深度</div><div class="btn-group">
          <UiButton v-for="qd in [1,8,32,64]" :key="qd" class="btn" :class="{active:form.qd===qd}" :aria-pressed="form.qd===qd" @click="form.qd=qd">{{ qd }}</UiButton>
        </div></div>
        <div class="section"><div class="section-title">运行时间</div><div class="btn-group">
          <UiButton v-for="rt in [2,5,10,30]" :key="rt" class="btn" :class="{active:form.rt===rt}" :aria-pressed="form.rt===rt" @click="form.rt=rt">{{ rt }}s</UiButton>
        </div></div>
        <UiButton variant="default" class="run-btn" :disabled="demo || !runEnabled || submitting || connection!=='已连接' || status==='preparing' || status==='running'" @click="startRun">{{ !runEnabled ? '预览模式 · 压测禁用' : submitting ? '提交中…' : '▶ 开始测试' }}</UiButton>
        <div class="section environment-section"><div class="section-title">测试环境</div>
          <div v-if="!groups.length" class="env-empty">完成测试后，环境组合会显示在这里。</div>
          <div class="env-list"><UiButton v-for="g in groups" :key="g.key" class="env-item" :class="{active:selectedKey===g.key}" @click="selectEnvironment(g.key)">
            <span class="env-config">{{ g.rw }} · {{ g.bs }} · QD{{ g.qd }} · {{ g.rows[0].historical ? '历史归档 · 时长未知' : g.rt + 's' }}</span>
            <span class="env-engines"><i v-for="s in g.rows" :key="s.engine" class="engine-badge" :class="s.engine">{{ s.engine_name }}</i></span>
          </UiButton></div>
        </div>
      </aside>
      <section class="main glass">
        <section v-if="stream.visible" class="stream-box">
          <div class="chart-title">● {{ environmentLabel(stream.title) }}<span>{{ stream.subtitle }}</span></div>
          <MetricChart :option="liveOption" label="实时 IOPS 与带宽双轴曲线" />
        </section>
        <div v-if="!rows.length" class="empty-state"><div class="empty-state-icon" aria-hidden="true">⌁</div>
          <h3>{{ remote ? '等待服务器已有结果' : '选择参数，开始测试' }}</h3>
          <p>{{ remote ? '这里只接收服务器推送，不发起压测；空白不代表 IOPS 为零。' : '配置完成后点击“开始测试”，同配置的多引擎结果会自动汇集到一起。' }}</p>
          <p v-if="groups.length">点击左侧“测试环境”查看已有结果。</p>
        </div>
        <template v-else>
          <div class="metrics-grid"><UiCard v-for="s in rows" :key="s.engine" class="metric-card" :style="{'--accent':color(s.engine)}">
            <div class="metric-label" :style="{color:color(s.engine)}">{{ s.engine_name }}</div>
            <div class="metric-value">{{ s.iops.toLocaleString() }}<span class="metric-unit">IOPS</span></div>
            <div class="metric-sub">{{ s.bw_mib }} MiB/s · {{ format(s.lat_us,0) }} µs · QD{{ s.qd }}</div>
          </UiCard></div>
          <div class="charts-grid"><UiCard v-for="panel in panels" :key="panel.key" class="chart-box" :class="'col-'+panel.col">
            <div class="chart-title">{{ panel.title }}<span>{{ panel.subtitle }}</span></div>
            <MetricChart :option="panel.option" :label="panel.title" :tall="'tall' in panel && panel.tall" />
            <small v-if="panel.key==='depth'" class="chart-note">来源：{{ rows[0].engine_name }}（与原版一致，取当前环境首个引擎）</small>
            <small v-if="panel.key==='radar'" class="chart-note">同配置内相对归一化，分值不是绝对性能；稳定性轴取延迟标准差。</small>
          </UiCard></div>
          <DataTable class="table-wrap"><table data-slot="table"><thead data-slot="table-header"><tr data-slot="table-row"><th data-slot="table-head">引擎</th><th data-slot="table-head">IOPS</th><th data-slot="table-head">带宽 MiB/s</th><th data-slot="table-head">平均延迟µs</th><th data-slot="table-head">最小µs</th><th data-slot="table-head">最大µs</th><th data-slot="table-head">标准差</th><th data-slot="table-head">CPU 用户</th><th data-slot="table-head">P99</th><th data-slot="table-head">P99.9</th></tr></thead>
            <tbody data-slot="table-body"><tr data-slot="table-row" v-for="s in rows" :key="s.engine"><td data-slot="table-cell" class="engine-cell"><i class="engine-dot" :style="{background:color(s.engine)}" />{{ s.engine_name }}</td>
              <td data-slot="table-cell">{{ s.iops.toLocaleString() }}</td><td data-slot="table-cell">{{ s.bw_mib }}</td><td data-slot="table-cell">{{ format(s.lat_us) }}</td><td data-slot="table-cell">{{ format(s.lat_min) }}</td><td data-slot="table-cell">{{ format(s.lat_max,0) }}</td>
              <td data-slot="table-cell">{{ format(s.lat_stdev) }}</td><td data-slot="table-cell">{{ s.cpu?.usr == null ? '—' : format(s.cpu.usr)+'%' }}</td><td data-slot="table-cell">{{ format(percentile(s,99),0) }}</td><td data-slot="table-cell">{{ format(percentile(s,99.9),0) }}</td>
            </tr></tbody></table></DataTable>
        </template>
      </section>
    </section>
  </PageLayout>
</template>


