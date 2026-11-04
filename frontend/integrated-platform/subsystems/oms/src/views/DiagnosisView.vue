<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Activity, ArrowRight, FileText, GitBranch, Network, RefreshCw, Search, Server, SlidersHorizontal } from 'lucide-vue-next'
import {
  fetchDiagnosis, fetchDiagnosisReport, fetchSchedulingAdvice, getRequestError, prettyJson,
  type DiagnosisDetail, type JsonObject,
} from '../api/diagnosis'
import { formatDate, formatLabel } from '../api/labels'
import type { EventRecord } from '../api/types'
import { useEventsStore } from '../stores/events'
import DiagnosisSummary from '../components/diagnosis/DiagnosisSummary.vue'
import PropagationPanel from '../components/diagnosis/PropagationPanel.vue'
import TopologyPanel from '../components/diagnosis/TopologyPanel.vue'
import HostDetailPanel from '../components/diagnosis/HostDetailPanel.vue'
import TokenUsage from '../components/diagnosis/TokenUsage.vue'

const route = useRoute()
const router = useRouter()
const eventsStore = useEventsStore()
const search = ref('')
const catalogError = ref('')
const diagnosis = ref<DiagnosisDetail | null>(null)
const detailLoading = ref(false)
const detailError = ref('')
const reportText = ref('')
const reportLoading = ref(false)
const reportError = ref('')
const advice = ref<JsonObject | null>(null)
const adviceLoading = ref(false)
const adviceError = ref('')
const reloadSequence = ref(0)
const tabs = [
  { id: 'summary', label: '诊断摘要', icon: Activity },
  { id: 'propagation', label: '传播与证据', icon: GitBranch },
  { id: 'topology', label: '拓扑视图', icon: Network },
  { id: 'report', label: '完整报告', icon: FileText },
  { id: 'hosts', label: '主机详情', icon: Server },
] as const
type TabId = typeof tabs[number]['id']
const activeTab = ref<TabId>('summary')
const tabPrefix = `diagnosis-${useId()}`
const routeRecordId = computed(() => typeof route.params.recordId === 'string' ? route.params.recordId : '')
const selectedRecord = computed(() => eventsStore.events.find((record) => record.record_id === routeRecordId.value))
const filteredEvents = computed(() => {
  const query = search.value.trim().toLowerCase()
  if (!query) return eventsStore.events
  return eventsStore.events.filter((record) => [record.event_id, record.summary, record.primary_failed_host, record.suite, record.run_id]
    .some((value) => typeof value === 'string' && value.toLowerCase().includes(query)))
})
let detailController: AbortController | null = null
let adviceController: AbortController | null = null
let disposed = false

async function loadCatalog() {
  if (eventsStore.loading) return
  catalogError.value = ''
  try {
    await eventsStore.loadEvents()
  } catch (failure) {
    if (!disposed) catalogError.value = getRequestError(failure)
  }
}

async function selectRecord(record: EventRecord, replace = false) {
  try {
    const target = `/diagnosis/${encodeURIComponent(record.record_id)}`
    if (replace) await router.replace(target)
    else await router.push(target)
  } catch (failure) {
    if (!disposed) catalogError.value = getRequestError(failure)
  }
}

watch([() => eventsStore.events, routeRecordId, () => eventsStore.loading], () => {
  if (routeRecordId.value || eventsStore.loading || !eventsStore.events.length) return
  const preferredRecord = eventsStore.events.find((record) => record.record_id === eventsStore.selectedRecordId)
    || eventsStore.events[0]
  if (preferredRecord) void selectRecord(preferredRecord, true)
}, { immediate: true })

watch([selectedRecord, () => route.fullPath, reloadSequence], async (_value, _previous, onCleanup) => {
  detailController?.abort()
  adviceController?.abort()
  const controller = new AbortController()
  detailController = controller
  onCleanup(() => controller.abort())
  const record = selectedRecord.value
  const selectedRoute = route.fullPath
  const isCurrent = () => !disposed && !controller.signal.aborted
    && route.fullPath === selectedRoute && routeRecordId.value === record?.record_id

  diagnosis.value = null
  detailError.value = ''
  detailLoading.value = Boolean(record)
  reportText.value = ''
  reportError.value = ''
  reportLoading.value = Boolean(record?.report_url)
  advice.value = null
  adviceError.value = ''
  adviceLoading.value = false
  if (!record) return
  eventsStore.selectedRecordId = record.record_id
  const currentRecord = record

  async function loadDetail() {
    try {
      const result = await fetchDiagnosis(currentRecord, controller.signal)
      if (isCurrent()) diagnosis.value = result
    } catch (failure) {
      if (isCurrent()) detailError.value = getRequestError(failure)
    } finally {
      if (isCurrent()) detailLoading.value = false
    }
  }

  async function loadReport() {
    if (!record?.report_url) return
    try {
      const result = await fetchDiagnosisReport(record.report_url, controller.signal)
      if (isCurrent()) reportText.value = result
    } catch (failure) {
      if (isCurrent()) reportError.value = getRequestError(failure)
    } finally {
      if (isCurrent()) reportLoading.value = false
    }
  }

  await Promise.all([loadDetail(), loadReport()])
}, { immediate: true })

async function generateAdvice() {
  const record = selectedRecord.value
  if (!record?.capabilities?.scheduling || adviceLoading.value || detailLoading.value) return
  adviceController?.abort()
  const controller = new AbortController()
  adviceController = controller
  const selectedRoute = route.fullPath
  const isCurrent = () => !disposed && !controller.signal.aborted
    && adviceController === controller && route.fullPath === selectedRoute
    && routeRecordId.value === record.record_id
  adviceLoading.value = true
  adviceError.value = ''
  advice.value = null
  try {
    const result = await fetchSchedulingAdvice(record, controller.signal)
    if (isCurrent()) advice.value = result
  } catch (failure) {
    if (isCurrent()) adviceError.value = getRequestError(failure)
  } finally {
    if (isCurrent()) adviceLoading.value = false
  }
}

function handleTabKey(event: KeyboardEvent, index: number) {
  let nextIndex: number
  if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length
  else if (event.key === 'ArrowLeft') nextIndex = (index + tabs.length - 1) % tabs.length
  else if (event.key === 'Home') nextIndex = 0
  else if (event.key === 'End') nextIndex = tabs.length - 1
  else return
  event.preventDefault()
  const nextTab = tabs[nextIndex]
  if (!nextTab) return
  activeTab.value = nextTab.id
  document.getElementById(`${tabPrefix}-${nextTab.id}`)?.focus()
}

onMounted(() => {
  if (!eventsStore.events.length && !eventsStore.loading) void loadCatalog()
})

onBeforeUnmount(() => {
  disposed = true
  detailController?.abort()
  adviceController?.abort()
})
</script>

<template>
  <div class="diagnosis-page">
    <header data-visual-region="page-heading" class="diagnosis-heading">
      <div class="heading-copy">
        <p class="page-description">从故障结论追溯传播证据，查看真实输入拓扑与主机级日志分析。</p>
      </div>
      <button
        type="button"
        data-slot="button"
        data-variant="outline"
        :disabled="eventsStore.loading"
        @click="loadCatalog"
      >
        <RefreshCw :size="14" aria-hidden="true" />
        <span>{{ eventsStore.loading ? '正在刷新' : '刷新记录' }}</span>
      </button>
    </header>

    <div data-visual-region="page-content">
      <div v-if="eventsStore.error || catalogError" class="inline-error error-banner" role="alert">
        <p>事件列表加载失败：{{ eventsStore.error || catalogError }}</p>
        <button type="button" data-slot="button" data-variant="outline" data-size="sm" :disabled="eventsStore.loading" @click="loadCatalog">
          <RefreshCw :size="13" aria-hidden="true" />重试
        </button>
      </div>

      <details v-if="eventsStore.warnings.length" class="catalog-warnings">
        <summary class="tabular-nums">数据加载提示（{{ eventsStore.warnings.length }}）</summary>
        <ul><li v-for="(warning, index) in eventsStore.warnings" :key="index">{{ warning }}</li></ul>
      </details>

      <div class="diagnosis-layout">
        <aside data-slot="card" class="event-sidebar" aria-label="诊断事件记录">
          <div class="list-heading">
            <h2 data-slot="card-title">事件记录</h2>
            <span data-slot="badge" class="tabular-nums">{{ eventsStore.events.length }} 条</span>
          </div>

          <label data-slot="input" class="search-field">
            <Search :size="14" class="search-icon" aria-hidden="true" />
            <input v-model="search" type="search" placeholder="搜索事件、主机或摘要" aria-label="搜索诊断事件" />
          </label>

          <p v-if="eventsStore.loading && !eventsStore.events.length" role="status" class="list-state">正在加载事件记录…</p>
          <p v-else-if="!eventsStore.events.length" class="list-state">暂无可查看的诊断记录。</p>
          <p v-else-if="!filteredEvents.length" class="list-state">没有符合搜索条件的记录。</p>
          <ul v-else class="event-list">
            <li v-for="record in filteredEvents" :key="record.record_id">
              <button
                type="button"
                class="event-row"
                :class="{ selected: record.record_id === routeRecordId }"
                :aria-current="record.record_id === routeRecordId ? 'true' : undefined"
                :disabled="detailLoading && record.record_id === routeRecordId"
                @click="selectRecord(record)"
              >
                <span class="event-row-top">
                  <span class="source-pill">{{ record.source === 'real' ? '真实事件' : record.source === 'mock' ? '模拟事件' : '未知来源' }}</span>
                  <span class="severity-text">{{ formatLabel(record.overall_severity) }}</span>
                </span>
                <strong class="event-id monospace">{{ record.event_id }}</strong>
                <span class="event-summary">{{ record.summary || '暂无事件摘要' }}</span>
                <span class="event-meta tabular-nums">
                  <span>{{ record.suite || '默认结果' }}</span>
                  <span>{{ formatDate(record.generated_at) }}</span>
                </span>
                <span v-if="record.run_id" class="event-run monospace">{{ record.run_id }}</span>
                <span class="event-open">
                  <span>查看诊断</span>
                  <ArrowRight :size="13" aria-hidden="true" />
                </span>
              </button>
            </li>
          </ul>
        </aside>

        <section data-slot="card" class="detail-area" :aria-busy="detailLoading" aria-label="事件诊断详情">
          <div v-if="!selectedRecord" data-slot="empty-state" class="detail-empty">
            <span data-slot="icon-badge" class="empty-icon" aria-hidden="true">
              <Activity :size="20" :stroke-width="1.6" />
            </span>
            <h2>{{ routeRecordId && !eventsStore.loading ? '未找到该诊断记录' : '选择一条诊断记录' }}</h2>
            <p>{{ routeRecordId && !eventsStore.loading ? '记录可能已删除，或当前目录未包含此记录。请选择左侧事件或刷新列表。' : '选择事件后，可在此查看诊断结论与相关证据。' }}</p>
          </div>

          <template v-else>
            <header class="detail-heading">
              <div class="detail-title-group">
                <h2 class="monospace">{{ selectedRecord.event_id }}</h2>
                <div class="detail-meta tabular-nums">
                  <span>{{ formatDate(diagnosis?.generatedAt || selectedRecord.generated_at) }}</span>
                  <span v-if="selectedRecord.suite" data-slot="badge" data-variant="outline">{{ selectedRecord.suite }}</span>
                  <span data-slot="badge">{{ formatLabel(selectedRecord.source) }}</span>
                </div>
              </div>
              <button
                type="button"
                data-slot="button"
                data-variant="outline"
                data-size="icon"
                :disabled="detailLoading || reportLoading || adviceLoading"
                aria-label="重新加载当前诊断"
                title="重新加载当前诊断"
                @click="reloadSequence += 1"
              >
                <RefreshCw :size="15" aria-hidden="true" />
              </button>
            </header>

            <p v-if="detailLoading" class="detail-state" role="status">正在读取诊断文件…</p>
            <div v-else-if="detailError" class="inline-error detail-error-box" role="alert">
              <p>诊断加载失败：{{ detailError }}</p>
              <button type="button" data-slot="button" data-variant="outline" data-size="sm" :disabled="detailLoading" @click="reloadSequence += 1">
                <RefreshCw :size="13" aria-hidden="true" />重试诊断
              </button>
            </div>

            <template v-else-if="diagnosis">
              <div class="tab-bar-region">
                <div data-slot="tabs-list" class="tab-bar" role="tablist" aria-label="诊断详情分类">
                  <button
                    v-for="(tab, index) in tabs"
                    :id="`${tabPrefix}-${tab.id}`"
                    :key="tab.id"
                    type="button"
                    role="tab"
                    data-slot="tabs-trigger"
                    :data-active="activeTab === tab.id ? 'true' : undefined"
                    :aria-selected="activeTab === tab.id"
                    :aria-controls="`${tabPrefix}-panel`"
                    :tabindex="activeTab === tab.id ? 0 : -1"
                    @click="activeTab = tab.id"
                    @keydown="handleTabKey($event, index)"
                  >
                    <component :is="tab.icon" :size="14" :stroke-width="1.75" aria-hidden="true" />
                    <span>{{ tab.label }}</span>
                  </button>
                </div>
              </div>

              <div :id="`${tabPrefix}-panel`" class="tab-content" role="tabpanel" :aria-labelledby="`${tabPrefix}-${activeTab}`" tabindex="0">
                <DiagnosisSummary v-if="activeTab === 'summary'" :diagnosis="diagnosis" />
                <PropagationPanel v-else-if="activeTab === 'propagation'" :diagnosis="diagnosis" />
                <TopologyPanel v-else-if="activeTab === 'topology'" :topology="diagnosis.topology" :primary-host="diagnosis.primaryHost" :causes="diagnosis.causes" />
                <section v-else-if="activeTab === 'report'" class="report-panel" :aria-busy="reportLoading">
                  <h3 class="section-heading">完整诊断报告</h3>
                  <p v-if="reportLoading" class="muted-note" role="status">正在读取报告…</p>
                  <div v-else-if="reportError" role="alert" class="report-error">
                    <p>报告加载失败：{{ reportError }}</p>
                    <button type="button" data-slot="button" data-variant="outline" data-size="sm" :disabled="detailLoading || reportLoading" @click="reloadSequence += 1">
                      <RefreshCw :size="13" aria-hidden="true" />重新加载报告
                    </button>
                  </div>
                  <template v-else-if="selectedRecord.report_url">
                    <p class="muted-note">以原始文本显示报告，不执行其中的 HTML、脚本或外部链接。</p>
                    <pre class="raw-report">{{ reportText || '报告文件为空。' }}</pre>
                  </template>
                  <p v-else class="muted-note">此记录未提供完整报告文件，可展开下方原始 JSON 查看全部诊断数据。</p>
                  <details class="raw-json">
                    <summary>查看完整诊断 JSON</summary>
                    <pre>{{ prettyJson(diagnosis.raw) }}</pre>
                  </details>
                </section>
                <HostDetailPanel
                  v-else-if="activeTab === 'hosts'"
                  :key="selectedRecord.record_id"
                  :hosts="diagnosis.hosts"
                  :record-id="selectedRecord.record_id"
                  :route-key="route.fullPath"
                  :primary-host="diagnosis.primaryHost"
                />
              </div>

              <div class="detail-footer">
                <TokenUsage :usage="diagnosis.usage" :model="diagnosis.model" />
              </div>

              <section data-slot="card-footer" class="scheduling" aria-label="调度建议" :aria-busy="adviceLoading">
                <div class="scheduling-heading">
                  <div>
                    <h3>调度建议</h3>
                    <p>生成可供人工审核的 K8s 策略，不会自动执行调度操作。</p>
                  </div>
                  <button
                    type="button"
                    data-slot="button"
                    data-variant="default"
                    :disabled="!selectedRecord.capabilities?.scheduling || adviceLoading || detailLoading"
                    @click="generateAdvice"
                  >
                    <SlidersHorizontal :size="14" aria-hidden="true" />
                    <span>{{ adviceLoading ? '正在生成' : '生成建议' }}</span>
                  </button>
                </div>
                <p v-if="!selectedRecord.capabilities?.scheduling" class="muted-note scheduling-status">当前记录不支持生成调度建议。</p>
                <p v-if="adviceLoading" role="status" class="muted-note scheduling-status">正在请求模型生成调度建议，最多等待约 105 秒；切换记录后将忽略本次响应。</p>
                <p v-if="adviceError" class="advice-error" role="alert">生成失败：{{ adviceError }}</p>
                <div v-if="advice" class="advice-result">
                  <h4>调度建议 JSON</h4>
                  <pre>{{ prettyJson(advice.advice ?? advice) }}</pre>
                  <TokenUsage :usage="advice.usage" />
                </div>
              </section>
            </template>
          </template>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.diagnosis-page {
  min-width: 0;
}

.diagnosis-heading {
  align-items: center;
}

.heading-copy {
  min-width: 0;
}

.page-description {
  color: var(--muted-foreground);
  font-size: 0.8125rem;
  line-height: 1.65;
  margin: 0;
}

.error-banner {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: center;
  margin-bottom: 18px;
}

.error-banner p {
  margin: 0;
}

.catalog-warnings {
  margin-bottom: 16px;
  padding: 10px 14px;
  border-radius: var(--radius-element);
  background: var(--rainflow-surface);
  box-shadow: inset 0 0 0 1px var(--rainflow-divider);
  color: var(--muted-foreground);
  font-size: 0.75rem;
  line-height: 1.7;
}

summary {
  cursor: pointer;
  font-weight: 500;
  color: var(--foreground);
}

.diagnosis-layout {
  display: grid;
  grid-template-columns: minmax(256px, 308px) minmax(0, 1fr);
  align-items: start;
  gap: 20px;
}

/* Left Event Rail */
.event-sidebar {
  min-width: 0;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.list-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.search-field {
  width: 100%;
}

.search-icon {
  color: var(--muted-foreground);
  flex-shrink: 0;
}

.list-state {
  font-size: 0.8125rem;
  color: var(--muted-foreground);
  padding: 24px 8px;
  text-align: center;
  margin: 0;
}

.event-list {
  list-style: none;
  margin: 0;
  padding: 2px;
  max-height: 72vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.event-row {
  display: flex;
  flex-direction: column;
  width: 100%;
  text-align: left;
  gap: 8px;
  padding: 13px 14px;
  background: var(--rainflow-surface-inset);
  border: 1px solid var(--rainflow-divider);
  color: var(--foreground);
  border-radius: 10px;
  transition:
    background-color var(--duration-fast) var(--ease-out-cubic),
    border-color var(--duration-fast) var(--ease-out-cubic),
    box-shadow var(--duration-fast) var(--ease-out-cubic);
}

.event-row:hover:not(:disabled) {
  border-color: var(--oms-border-hover);
}

.event-row.selected {
  background: var(--rainflow-surface-inset);
  border-color: var(--foreground);
  box-shadow: 0 0 0 1px var(--foreground);
}

.event-row:disabled {
  opacity: 0.65;
}

.event-row-top {
  display: flex;
  gap: 8px;
  justify-content: space-between;
  align-items: center;
  font-size: 0.6875rem;
  color: var(--muted-foreground);
}

.source-pill {
  padding: 1px 7px;
  border-radius: var(--radius-4xl);
  background: var(--rainflow-surface-strong);
  color: var(--foreground);
  font-weight: 500;
}

.severity-text {
  font-weight: 500;
}

.event-id {
  font-size: 0.78125rem;
  font-weight: 500;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.event-summary {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  color: var(--muted-foreground);
  font-size: 0.75rem;
  line-height: 1.65;
  overflow-wrap: anywhere;
}

.event-meta {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 4px 10px;
  font-size: 0.6875rem;
  color: var(--muted-foreground);
}

.event-run {
  font-size: 0.6875rem;
  line-height: 1.5;
  color: var(--muted-foreground);
  overflow-wrap: anywhere;
}

.event-open {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 6px;
  border-top: 1px solid var(--rainflow-divider);
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--foreground);
}

/* Right Detail Workspace */
.detail-area {
  min-width: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.detail-empty {
  min-height: 440px;
}

.empty-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
}

.detail-heading {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
  padding: 20px 24px 16px;
}

.detail-title-group {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.detail-title-group h2 {
  font-size: 1rem;
  font-weight: 500;
  line-height: 1.5;
  overflow-wrap: anywhere;
  margin: 0;
}

.detail-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  font-size: 0.75rem;
  color: var(--muted-foreground);
}

.detail-state {
  padding: 28px 24px;
  font-size: 0.8125rem;
  color: var(--muted-foreground);
  margin: 0;
}

.detail-error-box {
  margin: 0 24px 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.detail-error-box p {
  margin: 0;
}

.tab-bar-region {
  padding: 0 24px 14px;
  border-bottom: 1px solid var(--rainflow-divider);
}

.tab-content {
  padding: 24px;
  min-height: 320px;
}

.report-panel {
  max-width: 920px;
}

.section-heading {
  font-size: 0.9375rem;
  font-weight: 500;
  margin: 0 0 12px;
}

.muted-note {
  color: var(--muted-foreground);
  font-size: 0.78125rem;
  line-height: 1.7;
  margin: 0 0 12px;
}

.raw-report,
.raw-json pre,
.advice-result pre {
  font-size: 0.75rem;
  line-height: 1.8;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  background: var(--rainflow-surface-inset);
  border-radius: 10px;
  box-shadow: inset 0 0 0 1px var(--rainflow-divider);
  padding: 18px;
  max-height: 600px;
  overflow-y: auto;
  margin: 10px 0 0;
}

.raw-json {
  font-size: 0.78125rem;
  color: var(--muted-foreground);
  margin-top: 20px;
}

.report-error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 0.8125rem;
}

.detail-footer {
  padding: 14px 24px;
  border-top: 1px solid var(--rainflow-divider);
}

.scheduling {
  padding: 18px 24px 22px;
}

.scheduling-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
}

.scheduling h3 {
  margin: 0;
  font-size: 0.875rem;
  font-weight: 500;
}

.scheduling-heading p {
  margin: 4px 0 0;
  font-size: 0.75rem;
  line-height: 1.6;
  color: var(--muted-foreground);
}

.scheduling-status {
  margin: 10px 0 0;
}

.advice-error {
  font-size: 0.8125rem;
  color: var(--foreground);
  font-weight: 500;
  margin: 12px 0 0;
}

.advice-result {
  margin-top: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.advice-result h4 {
  margin: 0;
  font-size: 0.78125rem;
  font-weight: 500;
}

@media (min-width: 1600px) {
  .diagnosis-layout {
    grid-template-columns: 332px minmax(0, 1fr);
    gap: 24px;
  }
}

@media (max-width: 1100px) {
  .diagnosis-layout {
    grid-template-columns: 248px minmax(0, 1fr);
    gap: 16px;
  }

  .tab-content,
  .detail-heading,
  .scheduling,
  .tab-bar-region,
  .detail-footer {
    padding-inline: 18px;
  }
}

@media (max-width: 850px) {
  .diagnosis-layout {
    grid-template-columns: 1fr;
    gap: 18px;
  }

  .event-list {
    flex-direction: row;
    overflow-x: auto;
    padding-bottom: 6px;
    max-height: none;
  }

  .event-list li {
    flex: 0 0 256px;
  }

  .event-row {
    height: 100%;
  }

  .event-open {
    margin-top: auto;
  }
}
</style>
