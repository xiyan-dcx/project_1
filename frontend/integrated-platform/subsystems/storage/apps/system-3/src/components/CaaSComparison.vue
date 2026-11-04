<script setup lang="ts">
import { UiButton, UiCard, DataTable } from '@research-platform/design-system'
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { getCaaSHealth, getCaaSRun, startCaaSRun } from '@/api/caas'
import { acceptanceChecks, isScalaAfaBackend, numberText } from '@/domain/caas'
import type { CaaSHealth, CaaSJob, CaaSRunRequest, ComparisonSide } from '@/types/caas'

const health = ref<CaaSHealth | null>(null)
const healthError = ref('')
const job = ref<CaaSJob | null>(null)
const jobId = ref('')
const jobError = ref('')
const submitting = ref(false)
const mode = ref<'formal' | 'quick'>('formal')
const params = reactive<CaaSRunRequest>({ num: 100000, threads: 1, value_size: 1024, repeats: 3 })
const comparison = computed(() => job.value?.comparison)
const acceptance = computed(() => comparison.value?.acceptance)
const checks = computed(() => acceptance.value && comparison.value ? acceptanceChecks(acceptance.value, comparison.value) : [])
const jobSummary = computed(() => {
  if (!job.value) return ''
  if (job.value.state === 'done' && acceptance.value) {
    const failed = checks.value.filter(check => !check.ok).map(check => check.label)
    if (failed.length) {
      const prefix = acceptance.value.formal_run ? '整合对比已完成' : '快速链路检查已完成'
      return `${prefix}；未通过任务检查：${failed.join('；')}`
    }
    return '整合对比已完成，任务检查通过'
  }
  return job.value.message || job.value.error || job.value.state
})
const active = computed(() => !!jobId.value && !['done', 'failed'].includes(job.value?.state || ''))
const backendReady = computed(() => !!health.value && isScalaAfaBackend(health.value))
const canSubmit = computed(() => !submitting.value && !active.value && !!health.value?.ok &&
  health.value.runner_state === 'idle' && !health.value.active_job &&
  !!health.value.hdfs?.ready && !!health.value.hdfs?.datanode_stream_ready &&
  !!health.value.dpp_online?.passed && backendReady.value)
let healthTimer: ReturnType<typeof setInterval> | undefined
let pollTimer: ReturnType<typeof setTimeout> | undefined
let disposed = false
const pollFailures = ref(0)

function selectMode(next: 'formal' | 'quick') {
  mode.value = next
  if (next === 'formal') Object.assign(params, { num: 100000, threads: 1, value_size: 1024, repeats: 3 })
  else Object.assign(params, { num: 20000, threads: 1, value_size: 1024, repeats: 1 })
}

async function refreshHealth() {
  try {
    const result = await getCaaSHealth()
    if (disposed) return
    health.value = result
    healthError.value = result.ok ? '' : result.error || 'CaaS 数据路径未就绪'
  } catch (error) {
    if (disposed) return
    health.value = null
    healthError.value = error instanceof Error ? error.message : '健康接口不可用'
  }
}

async function pollJob() {
  if (!jobId.value || disposed) return
  try {
    job.value = await getCaaSRun(jobId.value)
    pollFailures.value = 0
    jobError.value = ''
    if (job.value.state === 'done' || job.value.state === 'failed') {
      sessionStorage.removeItem('system3-caas-job-id')
      await refreshHealth()
      return
    }
  } catch (error) {
    pollFailures.value += 1
    jobError.value = `状态查询失败（${pollFailures.value} 次）：${error instanceof Error ? error.message : '未知错误'}`
    if (pollFailures.value >= 3) return // Keep the ID in sessionStorage for manual refresh/recovery.
  }
  if (!disposed) pollTimer = setTimeout(() => void pollJob(), 2000)
}

async function submit() {
  if (!canSubmit.value) return
  const request = { ...params }
  if (!Number.isInteger(request.num) || request.num < 1000 || request.num > 2000000 ||
      !Number.isInteger(request.threads) || request.threads < 1 || request.threads > 64 ||
      !Number.isInteger(request.value_size) || request.value_size < 64 || request.value_size > 1048576 ||
      !Number.isInteger(request.repeats) || request.repeats < 1 || request.repeats > 5) {
    jobError.value = '测试参数超出服务器允许范围'
    return
  }
  submitting.value = true
  jobError.value = ''
  try {
    const id = await startCaaSRun(request)
    if (disposed) return
    jobId.value = id
    sessionStorage.setItem('system3-caas-job-id', id)
    localStorage.setItem('system3-caas-last-job-id', id)
    const url = new URL(location.href)
    url.searchParams.set('job', id)
    history.replaceState(null, '', url)
    job.value = { job_id: id, state: 'queued', message: '任务已提交，等待 Runner 执行' }
    await refreshHealth()
    await pollJob()
  } catch (error) {
    if (!disposed) jobError.value = error instanceof Error ? error.message : '提交失败'
  } finally {
    submitting.value = false
  }
}

function resumePolling() {
  if (!jobId.value) return
  pollFailures.value = 0
  clearTimeout(pollTimer)
  void pollJob()
}

const compact = (side?: ComparisonSide) => ({
  ops: side?.ops_per_sec?.toLocaleString() || '—',
  bandwidth: numberText(side?.mb_per_sec),
  p99: numberText(side?.write_latency_us?.p99),
  cv: numberText(side?.ops_per_sec_cv_percent),
  seconds: numberText(side?.seconds, 3),
})
const barPercent = (value?: number, other?: number) => `${Math.max(1, (value || 0) / Math.max(value || 0, other || 0, 1) * 100)}%`

onMounted(() => {
  void refreshHealth()
  healthTimer = setInterval(() => void refreshHealth(), 10000)
  const linked = new URLSearchParams(location.search).get('job')
  const saved = sessionStorage.getItem('system3-caas-job-id')
  const last = localStorage.getItem('system3-caas-last-job-id')
  const id = linked || saved || last
  if (id && /^compare-[0-9a-f]{32}$/.test(id)) {
    jobId.value = id
    resumePolling()
  }
})
onBeforeUnmount(() => {
  disposed = true
  clearInterval(healthTimer)
  clearTimeout(pollTimer)
})
</script>

<template>
  <section class="caas-board glass" aria-label="本地与远程 compaction 诊断">
    <div class="caas-heading">
      <div><p class="eyebrow">KUBERNETES · INTEGRATED PATH</p><h2>本地 / 远程 compaction</h2>
        <p class="muted">两组共享原 HDFS、AFA+dPP 和相同 LSM 参数，只改变 compaction 位置。这是组件实验，不是整套系统对照。</p></div>
      <span class="state-pill" :class="health?.ok && backendReady ? 'good' : 'bad'">{{ health?.ok && backendReady ? '数据路径就绪' : '数据路径待确认' }}</span>
    </div>

    <div role="alert" v-if="healthError" class="notice bad">健康检查：{{ healthError }}</div>
    <div class="health-grid">
      <span :class="health?.hdfs?.ready && health?.hdfs?.datanode_stream_ready ? 'good' : 'bad'">{{ health?.hdfs?.ready && health?.hdfs?.datanode_stream_ready ? '●' : '○' }} HDFS DataNode</span>
      <span :class="health?.procp?.ready ? 'good' : 'bad'">{{ health?.procp?.ready ? '●' : '○' }} ProCP</span>
      <span :class="health?.csa?.ready ? 'good' : 'bad'">{{ health?.csa?.ready ? '●' : '○' }} CSA</span>
      <span :class="health?.dpp_online?.passed ? 'good' : 'bad'">{{ health?.dpp_online?.passed ? '●' : '○' }} 在线 dPP 门禁</span>
      <span :class="backendReady ? 'good' : 'bad'">{{ backendReady ? '●' : '○' }} ScalaAFA NVMe-oF PV</span>
    </div>
    <p class="path">当前后端：{{ health?.storage_backend || '尚未获取' }} · Runner：{{ health?.runner_state || '未知' }}</p>

    <div class="caas-controls">
      <div class="mode-picker"><UiButton class="btn" :class="{active:mode==='formal'}" :disabled="active" @click="selectMode('formal')">标准负载</UiButton>
        <UiButton class="btn" :class="{active:mode==='quick'}" :disabled="active" @click="selectMode('quick')">快速链路检查</UiButton></div>
      <div class="inputs">
        <label>每轮写入数<input data-slot="input" v-model.number="params.num" type="number" min="1000" max="2000000" :disabled="active" /></label>
        <label>线程<input data-slot="input" v-model.number="params.threads" type="number" min="1" max="64" :disabled="active" /></label>
        <label>Value 字节<input data-slot="input" v-model.number="params.value_size" type="number" min="64" max="1048576" :disabled="active" /></label>
        <label>重复轮次<input data-slot="input" v-model.number="params.repeats" type="number" min="1" max="5" :disabled="active" /></label>
      </div>
      <p class="muted" v-if="mode==='quick'">快速模式只检查链路；若未触发远程压缩或 CV 超限，不可作为正式性能结论。</p>
      <p class="muted" v-else>两组使用相同参数；当前仅切换 compaction 位置。历史多参数调优结果不能作为整套系统收益的证据。</p>
      <UiButton variant="default" class="run-btn" :disabled="!canSubmit" @click="submit">{{ submitting ? '提交中…' : active ? '任务运行中…' : '▶ 启动 compaction 诊断' }}</UiButton>
      <p v-if="!canSubmit && !active && health?.active_job" class="notice">Runner 正在执行 {{ health.active_job }}，请等待现有任务完成。</p>
      <p role="alert" v-if="jobError" class="notice bad">{{ jobError }} <UiButton v-if="jobId && pollFailures >= 3" class="btn" @click="resumePolling">重试查询</UiButton></p>
    </div>

    <section v-if="job" class="caas-result" aria-live="polite">
      <div class="result-title"><h3>任务 {{ job.state === 'done' ? '已完成' : job.state === 'failed' ? '失败' : '进行中' }}</h3><code>{{ jobId }}</code></div>
      <p>{{ jobSummary }}</p>
      <template v-if="comparison?.local && comparison.caas">
        <div class="comparison-grid">
          <UiCard><small>本地 compaction</small><strong>{{ compact(comparison.local).ops }} <em>ops/s</em></strong><span>P99 {{ compact(comparison.local).p99 }} µs · CV {{ compact(comparison.local).cv }}%</span></UiCard>
          <UiCard><small>远程 compaction</small><strong>{{ compact(comparison.caas).ops }} <em>ops/s</em></strong><span>P99 {{ compact(comparison.caas).p99 }} µs · CV {{ compact(comparison.caas).cv }}% · 远程压缩 {{ comparison.caas.remote_compactions ?? 0 }} 次</span></UiCard>
          <UiCard><small>中位吞吐变化</small><strong>{{ numberText(comparison.improvement?.throughput_percent, 2) }}<em>%</em></strong></UiCard>
          <UiCard><small>P99 降低</small><strong>{{ numberText(comparison.improvement?.p99_reduction_percent, 2) }}<em>%</em></strong></UiCard>
        </div>
        <div class="comparison-bars" aria-label="吞吐和 P99 对比图">
          <div><h4>吞吐 ops/s（越高越好）</h4>
            <p><span>本地</span><span class="bar-track"><i class="bar local" :style="{width:barPercent(comparison.local.ops_per_sec, comparison.caas.ops_per_sec)}" /></span><span>{{ compact(comparison.local).ops }}</span></p>
            <p><span>远程</span><span class="bar-track"><i class="bar optimized" :style="{width:barPercent(comparison.caas.ops_per_sec, comparison.local.ops_per_sec)}" /></span><span>{{ compact(comparison.caas).ops }}</span></p>
          </div>
          <div><h4>P99 µs（越低越好）</h4>
            <p><span>本地</span><span class="bar-track"><i class="bar local" :style="{width:barPercent(comparison.local.write_latency_us?.p99, comparison.caas.write_latency_us?.p99)}" /></span><span>{{ compact(comparison.local).p99 }}</span></p>
            <p><span>远程</span><span class="bar-track"><i class="bar optimized" :style="{width:barPercent(comparison.caas.write_latency_us?.p99, comparison.local.write_latency_us?.p99)}" /></span><span>{{ compact(comparison.caas).p99 }}</span></p>
          </div>
        </div>
        <div v-if="acceptance" class="acceptance" :class="acceptance.passed ? 'accepted' : 'rejected'">
          <h4>{{ acceptance.passed ? '✓ 任务检查通过' : '⚠ 本轮未通过任务检查' }}</h4>
          <p v-if="!acceptance.passed">吞吐提高不等于全部门禁通过；请查看以下具体失败项。本轮数据仍可用于排查，不能作为完整优化链路的正式结论。</p>
          <ul><li v-for="check in checks" :key="check.label" :class="check.ok ? 'good' : 'bad'">{{ check.ok ? '✓' : '✕' }} {{ check.label }}</li></ul>
        </div>
        <DataTable class="table-wrap"><table data-slot="table"><thead data-slot="table-header"><tr data-slot="table-row"><th data-slot="table-head">模式</th><th data-slot="table-head">吞吐 ops/s</th><th data-slot="table-head">带宽 MB/s</th><th data-slot="table-head">耗时 s</th><th data-slot="table-head">P99 µs</th><th data-slot="table-head">CV %</th><th data-slot="table-head">远程压缩</th></tr></thead><tbody data-slot="table-body">
          <tr data-slot="table-row"><td data-slot="table-cell">本地 compaction</td><td data-slot="table-cell">{{ compact(comparison.local).ops }}</td><td data-slot="table-cell">{{ compact(comparison.local).bandwidth }}</td><td data-slot="table-cell">{{ compact(comparison.local).seconds }}</td><td data-slot="table-cell">{{ compact(comparison.local).p99 }}</td><td data-slot="table-cell">{{ compact(comparison.local).cv }}</td><td data-slot="table-cell">{{ comparison.local.remote_compactions ?? 0 }}</td></tr>
          <tr data-slot="table-row"><td data-slot="table-cell">远程 compaction</td><td data-slot="table-cell">{{ compact(comparison.caas).ops }}</td><td data-slot="table-cell">{{ compact(comparison.caas).bandwidth }}</td><td data-slot="table-cell">{{ compact(comparison.caas).seconds }}</td><td data-slot="table-cell">{{ compact(comparison.caas).p99 }}</td><td data-slot="table-cell">{{ compact(comparison.caas).cv }}</td><td data-slot="table-cell">{{ comparison.caas.remote_compactions ?? 0 }}</td></tr>
        </tbody></table></DataTable>
        <details v-if="comparison.local.runs?.length || comparison.caas.runs?.length" class="runs-detail"><summary>查看每轮原始结果</summary>
          <DataTable class="table-wrap"><table data-slot="table"><thead data-slot="table-header"><tr data-slot="table-row"><th data-slot="table-head">路径</th><th data-slot="table-head">轮次</th><th data-slot="table-head">吞吐 ops/s</th><th data-slot="table-head">带宽 MB/s</th><th data-slot="table-head">P99 µs</th><th data-slot="table-head">远程压缩</th></tr></thead><tbody data-slot="table-body">
            <tr data-slot="table-row" v-for="(run,index) in comparison.local.runs || []" :key="`local-${index}`"><td data-slot="table-cell">本地</td><td data-slot="table-cell">{{ run.repeat ?? index+1 }}</td><td data-slot="table-cell">{{ run.ops_per_sec.toLocaleString() }}</td><td data-slot="table-cell">{{ numberText(run.mb_per_sec) }}</td><td data-slot="table-cell">{{ numberText(run.write_latency_us?.p99) }}</td><td data-slot="table-cell">{{ run.remote_compactions ?? 0 }}</td></tr>
            <tr data-slot="table-row" v-for="(run,index) in comparison.caas.runs || []" :key="`caas-${index}`"><td data-slot="table-cell">远程</td><td data-slot="table-cell">{{ run.repeat ?? index+1 }}</td><td data-slot="table-cell">{{ run.ops_per_sec.toLocaleString() }}</td><td data-slot="table-cell">{{ numberText(run.mb_per_sec) }}</td><td data-slot="table-cell">{{ numberText(run.write_latency_us?.p99) }}</td><td data-slot="table-cell">{{ run.remote_compactions ?? 0 }}</td></tr>
          </tbody></table></DataTable>
        </details>
        <p class="path">数据路径：{{ comparison.storage_path || '结果未提供' }}<br>结果文件：{{ comparison.result_json || '结果未提供' }}</p>
      </template>
    </section>

    <div class="evidence-grid">
      <UiCard><h3>dPP</h3><p>在线安全门禁：{{ health?.dpp_online?.passed ? '通过' : '待确认' }}；校验 stripe {{ health?.dpp_online?.checked_stripes ?? '—' }}；不一致 {{ health?.dpp_online?.mismatches ?? '—' }}；恢复校验 {{ health?.dpp_online?.post_recovery_sha256_match ? '一致' : '待确认' }}。</p><small>远程 compaction 次数用于确认远程路径已执行；次数和存储门禁均不代表 dPP 性能收益。</small></UiCard>
      <UiCard><h3>ScalaAFA</h3><p>{{ health?.storage_backend || '尚未获取后端信息' }}</p><small>两组均使用现有 AFA/NVMe-oF 路径。本页不能用于归因 AFA 或 dPP 的独立收益。</small></UiCard>
      <UiCard><h3>CaaS-LSM</h3><p>远程压缩 {{ comparison?.caas?.remote_compactions ?? '—' }} 次；写入吞吐 {{ comparison?.caas?.ops_per_sec?.toLocaleString() ?? '—' }} ops/s；P99 {{ numberText(comparison?.caas?.write_latency_us?.p99) }} µs。</p><small>此处为本次组件指标；需结合基线、CV 和逐轮结果解释。</small></UiCard>
    </div>
  </section>
</template>


