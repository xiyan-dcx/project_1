<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Activity, ArrowRight, Clock, Copy, ExternalLink, Maximize2, Minimize2, RefreshCw, Server, ShieldCheck } from 'lucide-vue-next'
import { errorMessage } from '../api/client'
import { formatDate, formatLabel } from '../api/labels'
import { rootCauseKnowledge, type RootCauseKnowledge } from '../api/knowledge'
import { RISK_LEVELS, clusterRisk, hostRisks, isProductionRecord, riskLevel, riskTrend, type EventRisk } from '../api/risk'
import type { EventRecord, EventStatus } from '../api/types'
import { useEventsStore } from '../stores/events'
import { useTasksStore } from '../stores/tasks'
import HostRiskMatrix from '../components/overview/HostRiskMatrix.vue'
import RiskIndexCard from '../components/overview/RiskIndexCard.vue'
import RiskLevelBadge from '../components/overview/RiskLevelBadge.vue'

const REFRESH_SECONDS = 15

const router = useRouter()
const eventsStore = useEventsStore()
const tasksStore = useTasksStore()

const selectedRecordId = ref('')
const includeExperiments = ref(false)
const now = ref(new Date())
const lastUpdatedTimeText = ref('')
const refreshCountdownSeconds = ref(REFRESH_SECONDS)
const isManualRefreshing = ref(false)
const isFullscreenActive = ref(false)
const updatingStatus = ref(false)

let countdownTickerTimer: ReturnType<typeof setInterval> | null = null

const productionEvents = computed(() => eventsStore.events.filter(isProductionRecord))
const visibleEvents = computed(() => includeExperiments.value ? eventsStore.events : productionEvents.value)
const experimentCount = computed(() => eventsStore.events.length - productionEvents.value.length)

function occurredTime(record: EventRecord): number {
  return new Date(record.occurred_at || record.generated_at).getTime()
}

const sortedEvents = computed(() => [...visibleEvents.value].sort((first, second) => occurredTime(second) - occurredTime(first)))
const risk = computed(() => clusterRisk(visibleEvents.value, now.value))
const trend = computed(() => riskTrend(visibleEvents.value, now.value))
const hosts = computed(() => hostRisks(visibleEvents.value, now.value))
const riskByRecord = computed(() => new Map<string, EventRisk>(risk.value.events.map((item) => [item.record.record_id, item])))

const focusedEventRecord = computed<EventRecord | null>(() => {
  if (selectedRecordId.value) {
    const matchedRecord = sortedEvents.value.find((record) => record.record_id === selectedRecordId.value)
    if (matchedRecord) return matchedRecord
  }
  return risk.value.events[0]?.record ?? sortedEvents.value[0] ?? null
})

const focusedRisk = computed(() => focusedEventRecord.value ? riskByRecord.value.get(focusedEventRecord.value.record_id) ?? null : null)
const focusedScore = computed(() => Math.round(focusedRisk.value?.score ?? 0))
const knowledgeDetail = computed<RootCauseKnowledge>(() => rootCauseKnowledge(focusedEventRecord.value?.root_cause_category))

const statusCounts = computed(() => {
  const counts = { open: 0, acknowledged: 0, resolved: 0, experiment: 0 }
  for (const record of visibleEvents.value) counts[record.status ?? 'experiment'] += 1
  return counts
})

const elevatedHostCount = computed(() => hosts.value.filter((host) => host.level === 'high' || host.level === 'critical').length)

function rowScore(record: EventRecord): number | null {
  const item = riskByRecord.value.get(record.record_id)
  return item ? Math.round(item.score) : null
}

function statusText(record: EventRecord): string {
  return record.status ? formatLabel(record.status) : '实验记录'
}

function occurredText(record: EventRecord): string {
  return `${formatDate(record.occurred_at || record.generated_at)}${record.occurred_at_estimated ? '（日志无时间，按诊断时间估计）' : ''}`
}

async function executeDataRefresh(showLoadingIndicator = false) {
  if (showLoadingIndicator) {
    isManualRefreshing.value = true
  }
  try {
    await eventsStore.loadEvents()
    now.value = new Date()
    lastUpdatedTimeText.value = now.value.toLocaleTimeString('zh-CN', { hour12: false })
    refreshCountdownSeconds.value = REFRESH_SECONDS
  } finally {
    if (showLoadingIndicator) {
      isManualRefreshing.value = false
    }
  }
}

async function updateFocusedStatus(status: EventStatus) {
  const record = focusedEventRecord.value
  if (!record?.capabilities.status || updatingStatus.value) return
  updatingStatus.value = true
  try {
    await eventsStore.setEventStatus(record, status)
    selectedRecordId.value = record.record_id
    now.value = new Date()
    ElMessage.success(`已将 ${record.event_id} 标记为“${formatLabel(status)}”`)
  } catch (reason) {
    ElMessage.error(errorMessage(reason))
  } finally {
    updatingStatus.value = false
  }
}

function toggleFullscreenDisplay() {
  if (!document.fullscreenElement) {
    void document.documentElement.requestFullscreen().catch(() => {
      ElMessage.warning('当前浏览器环境限制全屏显示，请通过 F11 键切换全屏。')
    })
  } else {
    void document.exitFullscreen().catch(() => {})
  }
}

function handleFullscreenStateChange() {
  isFullscreenActive.value = Boolean(document.fullscreenElement)
}

function copyIncidentBriefingContent() {
  const targetRecord = focusedEventRecord.value
  if (!targetRecord) {
    ElMessage.info('当前暂无故障事件可生成通报。')
    return
  }

  const knowledge = knowledgeDetail.value
  const actionsListText = knowledge.recommendedActions.map((action, index) => `${index + 1}. ${action}`).join('\n')
  const clusterLevel = RISK_LEVELS[risk.value.level].label
  const eventLevel = RISK_LEVELS[riskLevel(focusedScore.value)].label
  const briefingMessage = `【电信网络集群运行故障快报】
----------------------------------------
集群风险指数：${risk.value.score} / 100（${clusterLevel}风险）
发生时间：${occurredText(targetRecord)}
处置状态：${statusText(targetRecord)}
本事件风险：${focusedScore.value}（${eventLevel}风险）
首发故障设备：${targetRecord.primary_failed_host || '未明确'}
故障研判性质：${knowledge.title}
AI 置信度评估：${formatLabel(targetRecord.confidence)}
----------------------------------------
【故障现象与影响】
${targetRecord.summary || '未提供详细摘要'}

【AI 根因分析说明】
${knowledge.plainDescription}

【应急处置建议】
${actionsListText}
----------------------------------------
通报生成时间：${new Date().toLocaleString('zh-CN', { hour12: false })}
诊断系统：OMS 网络故障诊断子系统`

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(briefingMessage).then(() => {
      ElMessage.success('故障快报已复制到剪贴板，可直接发送微信/邮件汇报。')
    }).catch(() => {
      fallbackCopyExecution(briefingMessage)
    })
  } else {
    fallbackCopyExecution(briefingMessage)
  }
}

function fallbackCopyExecution(textToCopy: string) {
  const temporaryTextArea = document.createElement('textarea')
  temporaryTextArea.value = textToCopy
  temporaryTextArea.style.position = 'fixed'
  temporaryTextArea.style.left = '-9999px'
  document.body.appendChild(temporaryTextArea)
  temporaryTextArea.focus()
  temporaryTextArea.select()
  try {
    const isSuccessful = document.execCommand('copy')
    if (isSuccessful) {
      ElMessage.success('故障快报已复制到剪贴板！')
    } else {
      ElMessage.error('复制失败，请手动选取文本。')
    }
  } catch {
    ElMessage.error('复制失败，请手动选取文本。')
  } finally {
    document.body.removeChild(temporaryTextArea)
  }
}

function selectFocusedIncident(recordId: string) {
  selectedRecordId.value = recordId
}

function navigateToTechnicalDiagnosis(recordId?: string) {
  if (recordId) {
    void router.push(`/diagnosis/${encodeURIComponent(recordId)}`)
  } else {
    void router.push('/diagnosis')
  }
}

onMounted(() => {
  void executeDataRefresh(false)
  document.addEventListener('fullscreenchange', handleFullscreenStateChange)

  countdownTickerTimer = setInterval(() => {
    if (refreshCountdownSeconds.value > 1) {
      refreshCountdownSeconds.value -= 1
    } else {
      refreshCountdownSeconds.value = REFRESH_SECONDS
      void executeDataRefresh(false)
    }
  }, 1000)
})

onBeforeUnmount(() => {
  document.removeEventListener('fullscreenchange', handleFullscreenStateChange)
  if (countdownTickerTimer) {
    clearInterval(countdownTickerTimer)
    countdownTickerTimer = null
  }
})
</script>

<template>
  <div class="overview-dashboard-container" :class="{ 'is-fullscreen-view': isFullscreenActive }">
    <header data-visual-region="page-heading" class="dashboard-header-bar" aria-label="监控大盘顶部状态栏">
      <div class="header-title-group">
        <h2 class="dashboard-main-title">集群运行态势大屏</h2>
        <p class="dashboard-subtitle">实时汇聚真实故障风险、受波及主机等级与值班应急处置状态</p>
      </div>

      <div class="header-action-group">
        <label class="experiment-toggle">
          <input v-model="includeExperiments" type="checkbox" />
          <span>包含实验与模拟数据（<span class="tabular-nums">{{ experimentCount }}</span> 条）</span>
        </label>

        <div class="live-sync-indicator tabular-nums" title="数据自动同步状态">
          <span class="live-pulse-dot" aria-hidden="true" />
          <span>自动刷新 {{ refreshCountdownSeconds }}s</span>
          <span v-if="lastUpdatedTimeText" class="sync-timestamp">· {{ lastUpdatedTimeText }}</span>
        </div>

        <button
          type="button"
          data-slot="button"
          data-variant="outline"
          :disabled="isManualRefreshing || eventsStore.loading"
          aria-label="立即刷新数据"
          @click="executeDataRefresh(true)"
        >
          <RefreshCw :size="14" :class="{ 'spin-icon': isManualRefreshing || eventsStore.loading }" aria-hidden="true" />
          <span>刷新数据</span>
        </button>

        <button
          type="button"
          data-slot="button"
          data-variant="outline"
          :aria-label="isFullscreenActive ? '退出全屏显示' : '进入全屏大屏展示'"
          @click="toggleFullscreenDisplay"
        >
          <Minimize2 v-if="isFullscreenActive" :size="14" aria-hidden="true" />
          <Maximize2 v-else :size="14" aria-hidden="true" />
          <span>{{ isFullscreenActive ? '退出全屏' : '全屏大屏' }}</span>
        </button>

        <button
          type="button"
          data-slot="button"
          data-variant="default"
          aria-label="进入工程师深度排障界面"
          @click="navigateToTechnicalDiagnosis(focusedEventRecord?.record_id)"
        >
          <span>进入技术排障</span>
          <ArrowRight :size="14" aria-hidden="true" />
        </button>
      </div>
    </header>

    <div data-visual-region="page-content" class="dashboard-content">
      <p v-if="eventsStore.error" class="inline-error" role="alert">事件数据加载失败：{{ eventsStore.error }}</p>

      <section class="kpi-cards-grid" aria-label="核心指标态势">
        <RiskIndexCard
          :risk="risk"
          :trend="trend"
          :scope-label="includeExperiments ? '含实验与模拟数据' : '仅统计真实故障事件'"
          @select="selectFocusedIncident"
        />

        <article data-slot="card" class="kpi-metric-card">
          <div class="kpi-card-header">
            <span class="kpi-title">故障事件</span>
            <span data-slot="badge" class="kpi-subtag">{{ includeExperiments ? '含实验记录' : '真实事件' }}</span>
          </div>
          <div class="kpi-score-display">
            <span class="score-number tabular-nums">{{ visibleEvents.length }}</span>
            <span class="score-unit">起</span>
          </div>
          <div class="kpi-breakdown-row tabular-nums">
            <span class="kpi-mini-pill"><strong>{{ statusCounts.open }}</strong> 待处置</span>
            <span class="kpi-mini-pill"><strong>{{ statusCounts.acknowledged }}</strong> 处置中</span>
            <span class="kpi-mini-pill"><strong>{{ statusCounts.resolved }}</strong> 已恢复</span>
          </div>
          <p v-if="statusCounts.experiment" class="kpi-card-footnote tabular-nums">另含 {{ statusCounts.experiment }} 条实验记录，无处置状态</p>
        </article>

        <article data-slot="card" class="kpi-metric-card">
          <div class="kpi-card-header">
            <span class="kpi-title">诊断涉及主机</span>
            <span data-slot="badge" class="kpi-subtag">来自诊断记录</span>
          </div>
          <div class="kpi-score-display">
            <span class="score-number tabular-nums">{{ hosts.length }}</span>
            <span class="score-unit">台</span>
          </div>
          <p class="kpi-card-footnote tabular-nums">
            <strong v-if="elevatedHostCount > 0">{{ elevatedHostCount }} 台主机风险为高或严重</strong>
            <span v-else>没有高风险主机</span>
          </p>
        </article>

        <article data-slot="card" class="kpi-metric-card">
          <div class="kpi-card-header">
            <span class="kpi-title">AI 故障研判引擎</span>
            <span data-slot="badge" :data-variant="tasksStore.running ? 'default' : 'outline'">
              {{ tasksStore.running ? '分析计算中' : '在线就绪' }}
            </span>
          </div>
          <div v-if="tasksStore.running" class="kpi-task-running-content">
            <div class="running-meta tabular-nums">
              <span class="running-label">进度 {{ tasksStore.task?.progress ?? 0 }}%</span>
              <span class="running-step">{{ tasksStore.task?.message || '正在分析日志上下文...' }}</span>
            </div>
            <div class="simple-progress-bar">
              <div class="progress-fill" :style="{ width: `${tasksStore.task?.progress ?? 0}%` }" />
            </div>
          </div>
          <div v-else class="kpi-score-display">
            <span class="score-text-status">空闲待命</span>
          </div>
          <p class="kpi-card-footnote">
            {{ tasksStore.running ? '后台独立线程正在执行 6 阶段流水线诊断' : '可在“事件管理”中扫描新日志并发起诊断' }}
          </p>
        </article>
      </section>

      <section class="main-split-section" aria-label="主机风险与重点事件">
        <article data-slot="card" class="dashboard-panel">
          <div class="panel-header">
            <div class="panel-header-left">
              <span data-slot="icon-badge" aria-hidden="true">
                <Server :size="15" :stroke-width="1.75" />
              </span>
              <div>
                <h3 data-slot="card-title" class="panel-title">主机风险等级</h3>
                <p data-slot="card-description">点击主机联动查看关联事件</p>
              </div>
            </div>
          </div>
          <div class="panel-body">
            <HostRiskMatrix
              :hosts="hosts"
              :focused-record-id="focusedEventRecord?.record_id ?? ''"
              @select="selectFocusedIncident"
            />
          </div>
        </article>

        <article data-slot="card" class="dashboard-panel incident-briefing-panel">
          <div class="panel-header">
            <div class="panel-header-left">
              <span data-slot="icon-badge" aria-hidden="true">
                <Activity :size="15" :stroke-width="1.75" />
              </span>
              <div>
                <h3 data-slot="card-title" class="panel-title">重点故障通报与处置</h3>
                <p data-slot="card-description">面向值班汇报与状态闭环跟踪</p>
              </div>
            </div>
            <button
              v-if="focusedEventRecord"
              type="button"
              data-slot="button"
              data-variant="outline"
              data-size="sm"
              aria-label="一键复制故障快报文本"
              @click="copyIncidentBriefingContent"
            >
              <Copy :size="13" aria-hidden="true" />
              <span>复制通报文本</span>
            </button>
          </div>

          <template v-if="focusedEventRecord">
            <div class="panel-body briefing-content-container">
              <div class="briefing-summary-banner" :class="`is-${riskLevel(focusedScore)}`">
                <div class="banner-headline-row">
                  <RiskLevelBadge :level="riskLevel(focusedScore)" :score="focusedScore" />
                  <h4 class="headline-title">{{ knowledgeDetail.title }}</h4>
                  <span class="headline-time tabular-nums">发生于 {{ occurredText(focusedEventRecord) }}</span>
                </div>
                <p class="headline-description">
                  <strong>故障现象：</strong>{{ focusedEventRecord.summary }}
                </p>
              </div>

              <div class="briefing-section">
                <div class="status-row">
                  <div class="status-info">
                    <h5 class="section-label">处置状态</h5>
                    <p class="status-line tabular-nums">
                      <span data-slot="badge" data-variant="outline">{{ statusText(focusedEventRecord) }}</span>
                      <span v-if="focusedEventRecord.resolved_at" class="status-time">恢复于 {{ formatDate(focusedEventRecord.resolved_at) }}</span>
                      <span v-else-if="focusedEventRecord.status_updated_at" class="status-time">更新于 {{ formatDate(focusedEventRecord.status_updated_at) }}</span>
                      <span v-if="!focusedRisk && focusedEventRecord.status === 'resolved'" class="status-time">· 已不计入风险指数</span>
                    </p>
                  </div>
                  <div v-if="focusedEventRecord.capabilities.status" class="status-actions">
                    <button
                      v-if="focusedEventRecord.status === 'open'"
                      type="button"
                      data-slot="button"
                      data-variant="outline"
                      data-size="sm"
                      :disabled="updatingStatus"
                      @click="updateFocusedStatus('acknowledged')"
                    >
                      开始处置
                    </button>
                    <button
                      v-if="focusedEventRecord.status !== 'resolved'"
                      type="button"
                      data-slot="button"
                      data-variant="default"
                      data-size="sm"
                      :disabled="updatingStatus"
                      @click="updateFocusedStatus('resolved')"
                    >
                      标记已恢复
                    </button>
                    <button
                      v-else
                      type="button"
                      data-slot="button"
                      data-variant="outline"
                      data-size="sm"
                      :disabled="updatingStatus"
                      @click="updateFocusedStatus('open')"
                    >
                      重新打开
                    </button>
                  </div>
                </div>
                <p v-if="!focusedEventRecord.capabilities.status" class="section-body-text">实验记录用于评测诊断效果，不参与处置。</p>
              </div>

              <div class="briefing-section">
                <h5 class="section-label">AI 智能研判原因（通俗说明）</h5>
                <p class="section-body-text">{{ knowledgeDetail.plainDescription }}</p>
                <div class="briefing-meta-tags">
                  <span class="meta-chip">首发异常设备 <strong class="monospace">{{ focusedEventRecord.primary_failed_host || '未标记' }}</strong></span>
                  <span class="meta-chip">AI 研判置信度 <strong>{{ formatLabel(focusedEventRecord.confidence) }}</strong></span>
                  <span class="meta-chip">事件标识 <span class="monospace">{{ focusedEventRecord.event_id }}</span></span>
                </div>
              </div>

              <div class="briefing-section">
                <h5 class="section-label">建议应急处置动作</h5>
                <ol class="action-steps-list">
                  <li v-for="(actionStep, stepIndex) in knowledgeDetail.recommendedActions" :key="stepIndex">
                    <span class="step-index monospace tabular-nums">{{ String(stepIndex + 1).padStart(2, '0') }}</span>
                    <span>{{ actionStep }}</span>
                  </li>
                </ol>
              </div>
            </div>

            <footer data-slot="card-footer" class="briefing-footer-actions">
              <span class="footer-hint">支持查看真实输入拓扑与逐机服务证据</span>
              <button
                type="button"
                data-slot="button"
                data-variant="outline"
                data-size="sm"
                @click="navigateToTechnicalDiagnosis(focusedEventRecord.record_id)"
              >
                <span>查看完整技术诊断报告（拓扑与日志证据）</span>
                <ArrowRight :size="14" aria-hidden="true" />
              </button>
            </footer>
          </template>

          <div v-else data-slot="empty-state" class="empty-incident-state">
            <span data-slot="icon-badge" class="empty-shield-badge" aria-hidden="true">
              <ShieldCheck :size="20" :stroke-width="1.6" />
            </span>
            <h4>暂无故障事件</h4>
            <p>还没有诊断出的故障事件。可在“事件管理”中扫描新日志并发起诊断。</p>
          </div>
        </article>
      </section>

      <section data-visual-region="data-table" class="recent-events-panel" aria-label="近期故障事件">
        <div class="panel-header">
          <div class="panel-header-left">
            <span data-slot="icon-badge" aria-hidden="true">
              <Clock :size="15" :stroke-width="1.75" />
            </span>
            <div>
              <h3 data-slot="card-title" class="panel-title">近期集群事件记录</h3>
              <p data-slot="card-description" class="tabular-nums">共 {{ sortedEvents.length }} 条记录 · 点击任意行联动上方通报卡片</p>
            </div>
          </div>
        </div>

        <div class="table-responsive-wrapper" data-slot="table-container">
          <table data-slot="table" class="recent-events-table" aria-label="近期事件列表">
            <thead data-slot="table-header">
              <tr data-slot="table-row">
                <th data-slot="table-head" scope="col" class="column-time">发生时间</th>
                <th data-slot="table-head" scope="col" class="column-type">故障性质</th>
                <th data-slot="table-head" scope="col" class="column-host">首发主机</th>
                <th data-slot="table-head" scope="col" class="column-status">处置状态</th>
                <th data-slot="table-head" scope="col" class="column-risk">当前风险</th>
                <th data-slot="table-head" scope="col" class="column-summary">现象概述</th>
                <th data-slot="table-head" scope="col" class="column-action">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="event in sortedEvents"
                :key="event.record_id"
                data-slot="table-row"
                :class="{ 'is-selected-row': focusedEventRecord?.record_id === event.record_id }"
                @click="selectFocusedIncident(event.record_id)"
              >
                <td data-slot="table-cell" class="column-time tabular-nums">{{ formatDate(event.occurred_at || event.generated_at) }}</td>
                <td data-slot="table-cell" class="column-type">
                  <span class="event-type-label">{{ formatLabel(event.root_cause_category) }}</span>
                </td>
                <td data-slot="table-cell" class="column-host monospace tabular-nums">{{ event.primary_failed_host || '—' }}</td>
                <td data-slot="table-cell" class="column-status">
                  <span data-slot="badge" data-variant="outline">{{ statusText(event) }}</span>
                </td>
                <td data-slot="table-cell" class="column-risk">
                  <RiskLevelBadge v-if="rowScore(event) !== null" :level="riskLevel(rowScore(event) ?? 0)" :score="rowScore(event) ?? 0" />
                  <span v-else class="muted">不计入</span>
                </td>
                <td data-slot="table-cell" class="column-summary" :title="event.summary">
                  {{ event.summary }}
                </td>
                <td data-slot="table-cell" class="column-action" @click.stop>
                  <button
                    type="button"
                    data-slot="button"
                    data-variant="outline"
                    data-size="xs"
                    title="前往技术诊断详情"
                    @click="navigateToTechnicalDiagnosis(event.record_id)"
                  >
                    <span>排障详情</span>
                    <ExternalLink :size="12" aria-hidden="true" />
                  </button>
                </td>
              </tr>
              <tr v-if="sortedEvents.length === 0" data-slot="table-row" data-empty="true">
                <td colspan="7" class="table-empty-cell">
                  暂无事件记录。
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.overview-dashboard-container {
  width: 100%;
}

.overview-dashboard-container.is-fullscreen-view {
  padding: 24px;
  background: var(--background);
  min-height: 100svh;
}

.dashboard-content {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.dashboard-header-bar {
  align-items: center;
}

.header-title-group {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.dashboard-main-title {
  font-size: 1.1875rem;
  font-weight: 500;
  letter-spacing: -0.015em;
  margin: 0;
}

.dashboard-subtitle {
  font-size: 0.78125rem;
  color: var(--muted-foreground);
  margin: 0;
}

.header-action-group {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.experiment-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 11px;
  border-radius: var(--radius-element);
  background: var(--rainflow-surface);
  box-shadow: inset 0 0 0 1px var(--rainflow-divider);
  font-size: 0.78125rem;
  color: var(--muted-foreground);
  cursor: pointer;
}

.experiment-toggle input {
  width: 14px;
  height: 14px;
  margin: 0;
  accent-color: var(--primary);
}

.live-sync-indicator {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 11px;
  border-radius: var(--radius-element);
  background: var(--rainflow-surface);
  box-shadow: inset 0 0 0 1px var(--rainflow-divider);
  font-size: 0.75rem;
  color: var(--muted-foreground);
}

.live-pulse-dot {
  width: 6px;
  height: 6px;
  background-color: var(--foreground);
  border-radius: 50%;
}

.sync-timestamp {
  color: var(--muted-foreground);
}

.spin-icon {
  animation: rotateSpin 0.9s linear infinite;
}

@keyframes rotateSpin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* KPI Grid */
.kpi-cards-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 14px;
}

.kpi-metric-card {
  padding: 18px 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}

.kpi-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.kpi-title {
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--muted-foreground);
}

.kpi-subtag {
  font-size: 0.6875rem;
}

.kpi-score-display {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin-top: 2px;
}

.score-number {
  font-size: 2rem;
  font-weight: 500;
  letter-spacing: -0.028em;
  line-height: 1.05;
  color: var(--foreground);
}

.score-unit {
  font-size: 0.8125rem;
  color: var(--muted-foreground);
}

.score-text-status {
  font-size: 1.25rem;
  font-weight: 500;
  letter-spacing: -0.015em;
  color: var(--foreground);
}

.kpi-card-footnote {
  font-size: 0.78125rem;
  color: var(--muted-foreground);
  line-height: 1.55;
  margin: auto 0 0;
}

.kpi-card-footnote strong {
  font-weight: 500;
  color: var(--foreground);
}

.kpi-breakdown-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.kpi-mini-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: var(--radius-4xl);
  background: var(--rainflow-surface-inset);
  box-shadow: inset 0 0 0 1px var(--rainflow-divider);
  font-size: 0.75rem;
  color: var(--muted-foreground);
}

.kpi-mini-pill strong {
  font-weight: 500;
  color: var(--foreground);
}

.kpi-task-running-content {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.running-meta {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 0.75rem;
  color: var(--muted-foreground);
}

.running-step {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.simple-progress-bar {
  height: 5px;
  background: var(--rainflow-surface-strong);
  border-radius: var(--radius-4xl);
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: var(--primary);
  transition: width var(--duration-fast) var(--ease-out-cubic);
}

/* Main Split */
.main-split-section {
  display: grid;
  grid-template-columns: minmax(340px, 1fr) minmax(440px, 1.3fr);
  gap: 16px;
  align-items: start;
}

.dashboard-panel {
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 20px 14px;
  border-bottom: 1px solid var(--rainflow-divider);
}

.panel-header-left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.panel-title {
  margin: 0;
}

.panel-body {
  padding: 16px 20px 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* Incident Briefing (Zero Nested Card Clutter) */
.briefing-content-container {
  gap: 0;
  padding-bottom: 16px;
}

.briefing-summary-banner {
  padding: 14px 16px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--rainflow-surface-inset);
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 4px;
}

.briefing-summary-banner.is-attention {
  border-style: dashed;
  border-color: var(--muted-foreground);
}

.briefing-summary-banner.is-high {
  border-color: var(--foreground);
}

.briefing-summary-banner.is-critical {
  border: 2px solid var(--foreground);
  padding: 13px 15px;
}

.banner-headline-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.headline-title {
  font-size: 0.9375rem;
  font-weight: 500;
  color: var(--foreground);
  margin: 0;
}

.headline-time {
  font-size: 0.75rem;
  color: var(--muted-foreground);
  margin-left: auto;
}

.headline-description {
  font-size: 0.8125rem;
  color: var(--foreground);
  line-height: 1.65;
  margin: 0;
}

.headline-description strong {
  font-weight: 500;
}

.briefing-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px 0;
  border-bottom: 1px solid var(--rainflow-divider);
}

.briefing-section:last-child {
  border-bottom: 0;
  padding-bottom: 0;
}

.status-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px 16px;
}

.status-info {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.section-label {
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--muted-foreground);
  margin: 0;
}

.section-body-text {
  font-size: 0.8125rem;
  color: var(--foreground);
  line-height: 1.7;
  margin: 0;
}

.status-line {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 0.8125rem;
  color: var(--foreground);
  margin: 0;
}

.status-time {
  font-size: 0.75rem;
  color: var(--muted-foreground);
}

.status-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.briefing-meta-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 2px;
}

.meta-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 9px;
  border-radius: var(--radius-inner);
  background: var(--rainflow-surface-inset);
  box-shadow: inset 0 0 0 1px var(--rainflow-divider);
  font-size: 0.75rem;
  color: var(--muted-foreground);
}

.meta-chip strong,
.meta-chip .monospace {
  font-weight: 500;
  color: var(--foreground);
}

.action-steps-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.action-steps-list li {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  font-size: 0.8125rem;
  color: var(--foreground);
  line-height: 1.6;
}

.step-index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  border-radius: 6px;
  background: var(--rainflow-surface-strong);
  color: var(--muted-foreground);
  font-size: 0.6875rem;
  font-weight: 500;
}

.briefing-footer-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
}

.footer-hint {
  font-size: 0.75rem;
  color: var(--muted-foreground);
}

.empty-shield-badge {
  width: 40px;
  height: 40px;
  border-radius: 10px;
}

/* Recent Events Data Table */
.recent-events-panel {
  overflow: hidden;
}

.table-responsive-wrapper {
  width: 100%;
  overflow-x: auto;
  background: var(--rainflow-surface-inset);
}

.recent-events-table tbody tr {
  cursor: pointer;
}

.column-time {
  white-space: nowrap;
  color: var(--muted-foreground);
  font-size: 0.75rem;
  width: 165px;
}

.column-type {
  white-space: nowrap;
  width: 155px;
}

.event-type-label {
  font-weight: 500;
  color: var(--foreground);
}

.column-host {
  white-space: nowrap;
  width: 135px;
  font-size: 0.78125rem;
}

.column-status {
  white-space: nowrap;
  width: 96px;
}

.column-risk {
  white-space: nowrap;
  width: 120px;
}

.column-summary {
  max-width: 420px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--muted-foreground);
}

.column-action {
  white-space: nowrap;
  width: 108px;
  text-align: right;
}

.recent-events-table td.table-empty-cell {
  text-align: center;
  padding: 36px;
  color: var(--muted-foreground);
}

@media (max-width: 1280px) {
  .kpi-cards-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .main-split-section {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 768px) {
  .kpi-cards-grid {
    grid-template-columns: 1fr;
  }

  .headline-time {
    margin-left: 0;
    width: 100%;
  }
}
</style>
