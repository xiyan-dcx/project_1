<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { RefreshCw, Server } from 'lucide-vue-next'
import {
  fetchHostAnalysis, getRequestError, prettyJson,
  type DeviceAnalysis, type DiagnosticHost,
} from '../../api/diagnosis'
import { formatLabel } from '../../api/labels'
import FindingsList from './FindingsList.vue'
import TokenUsage from './TokenUsage.vue'

const props = defineProps<{ hosts: DiagnosticHost[]; recordId: string; routeKey: string; primaryHost: string }>()
const selectedAddress = ref('')
const analysis = ref<DeviceAnalysis | null>(null)
const loading = ref(false)
const error = ref('')
const retryCount = ref(0)
const selectedHost = computed(() => props.hosts.find((host) => host.address === selectedAddress.value))
let requestController: AbortController | null = null

watch([() => props.hosts, () => props.primaryHost], ([hosts, primaryHost]) => {
  if (!hosts.some((host) => host.address === selectedAddress.value)) {
    selectedAddress.value = hosts.find((host) => host.address === primaryHost)?.address || hosts[0]?.address || ''
  }
}, { immediate: true })

watch([selectedHost, () => props.recordId, () => props.routeKey, retryCount], async (_value, _previous, onCleanup) => {
  requestController?.abort()
  const controller = new AbortController()
  requestController = controller
  onCleanup(() => controller.abort())
  const recordId = props.recordId
  const routeKey = props.routeKey
  const host = selectedHost.value
  const isCurrent = () => !controller.signal.aborted && props.recordId === recordId
    && props.routeKey === routeKey && selectedAddress.value === host?.address

  error.value = ''
  analysis.value = host?.analysis || null
  loading.value = false
  if (!host || host.analysis || !host.analysisUrl) return

  loading.value = true
  try {
    const result = await fetchHostAnalysis(host.analysisUrl, controller.signal)
    if (isCurrent()) analysis.value = result
  } catch (failure) {
    if (isCurrent()) error.value = getRequestError(failure)
  } finally {
    if (isCurrent()) loading.value = false
  }
}, { immediate: true })

onBeforeUnmount(() => requestController?.abort())
</script>

<template>
  <section class="host-detail-section">
    <h3>主机详情</h3>
    <p v-if="!props.hosts.length" class="empty">此诊断记录没有提供主机信息。</p>
    <template v-else>
      <div class="host-selector" aria-label="选择主机">
        <button
          v-for="host in props.hosts"
          :key="host.address"
          type="button"
          class="host-pill"
          :aria-pressed="selectedAddress === host.address"
          :class="{ selected: selectedAddress === host.address }"
          :disabled="loading && selectedAddress === host.address"
          @click="selectedAddress = host.address"
        >
          <Server :size="14" :stroke-width="1.75" aria-hidden="true" />
          <span class="monospace tabular-nums">{{ host.address }}</span>
          <span v-if="host.address === props.primaryHost" class="primary-tag">首要故障</span>
        </button>
      </div>

      <div :aria-busy="loading" class="host-content">
        <p v-if="loading" role="status" class="empty">正在加载主机分析…</p>
        <div v-else-if="error" role="alert" class="error">
          <p>主机分析加载失败：{{ error }}</p>
          <button type="button" data-slot="button" data-variant="outline" data-size="sm" :disabled="loading" @click="retryCount += 1">
            <RefreshCw :size="13" aria-hidden="true" />重试主机分析
          </button>
        </div>
        <template v-else-if="analysis">
          <div class="analysis-header">
            <h4 class="monospace tabular-nums">{{ selectedAddress }}</h4>
            <span data-slot="badge" data-variant="outline">风险 {{ formatLabel(analysis.risk) }}</span>
            <span data-slot="badge">置信度 {{ formatLabel(analysis.confidence) }}</span>
          </div>
          <p class="summary">{{ analysis.summary || '暂无主机摘要。' }}</p>

          <h4 class="section-heading">跨服务发现</h4>
          <FindingsList :findings="analysis.findings" empty-text="暂无跨服务发现。" />

          <h4 class="section-heading">服务评估</h4>
          <p v-if="!analysis.services.length" class="empty">暂无服务评估。</p>
          <ul v-else class="services">
            <li v-for="(service, index) in analysis.services" :key="index">
              <div class="service-top">
                <strong>{{ service.name || '未命名服务' }}</strong>
                <span data-slot="badge" data-variant="outline">风险 {{ formatLabel(service.risk) }}</span>
              </div>
              <p>{{ service.summary || '未提供评估说明。' }}</p>
            </li>
          </ul>

          <TokenUsage v-if="Object.keys(analysis.usage).length" :usage="analysis.usage" />
          <p v-if="selectedHost?.analysis" class="source-note">数据来源：当前诊断文件内嵌的主机分析。</p>
          <p v-else class="source-note">数据来源：当前记录关联的主机分析资源。</p>
        </template>
        <p v-else class="empty">此主机没有内嵌分析或可用的分析资源，不推断其健康状态。</p>

        <details v-if="selectedHost && Object.keys(selectedHost.temporal).length" class="temporal">
          <summary>主机时序特征（原始数据）</summary>
          <pre>{{ prettyJson(selectedHost.temporal) }}</pre>
        </details>
      </div>
    </template>
  </section>
</template>

<style scoped>
.host-detail-section {
  max-width: 920px;
}

h3 {
  font-size: 0.9375rem;
  font-weight: 500;
  margin: 0 0 14px;
}

.host-selector {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.host-pill {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 32px;
  padding: 0 12px;
  background: var(--rainflow-surface-strong);
  border: 1px solid transparent;
  color: var(--muted-foreground);
  border-radius: var(--radius-element);
  font-size: 0.78125rem;
  font-weight: 500;
  max-width: 100%;
  transition:
    background-color var(--duration-fast) var(--ease-out-cubic),
    color var(--duration-fast) var(--ease-out-cubic),
    border-color var(--duration-fast) var(--ease-out-cubic),
    box-shadow var(--duration-fast) var(--ease-out-cubic);
}

.host-pill:hover:not(:disabled) {
  color: var(--foreground);
  background: var(--accent);
}

.host-pill.selected {
  color: var(--foreground);
  background: var(--rainflow-surface-inset);
  border-color: var(--foreground);
  box-shadow: 0 1px 2px oklch(0 0 0 / 0.05);
}

.host-pill:disabled {
  opacity: 0.45;
}

.primary-tag {
  font-size: 0.6875rem;
  padding: 1px 6px;
  border-radius: var(--radius-4xl);
  background: var(--primary);
  color: var(--primary-foreground);
  font-weight: 500;
}

.host-content {
  margin-top: 20px;
}

.analysis-header {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
  align-items: center;
  padding: 13px 16px;
  background: var(--rainflow-surface-inset);
  border-radius: 10px;
  box-shadow: inset 0 0 0 1px var(--rainflow-divider);
}

.analysis-header h4 {
  margin: 0;
  font-size: 0.875rem;
  font-weight: 500;
  overflow-wrap: anywhere;
}

.summary {
  font-size: 0.84375rem;
  line-height: 1.75;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  margin: 14px 0 0;
  color: var(--foreground);
}

.section-heading {
  margin: 22px 0 10px;
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--muted-foreground);
}

.services {
  list-style: none;
  padding: 0;
  margin: 0 0 18px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.services li {
  background: var(--rainflow-surface-inset);
  border-radius: 10px;
  box-shadow: inset 0 0 0 1px var(--rainflow-divider);
  padding: 14px 16px;
}

.service-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  font-size: 0.8125rem;
}

.services strong {
  font-weight: 500;
  overflow-wrap: anywhere;
  color: var(--foreground);
}

.services p {
  font-size: 0.78125rem;
  line-height: 1.65;
  margin: 8px 0 0;
  overflow-wrap: anywhere;
  color: var(--muted-foreground);
}

.empty,
.error {
  color: var(--muted-foreground);
  font-size: 0.8125rem;
  line-height: 1.65;
  padding: 14px 0;
}

.error {
  color: var(--foreground);
}

.source-note {
  font-size: 0.75rem;
  color: var(--muted-foreground);
  margin: 16px 0 0;
}

.temporal {
  margin-top: 16px;
  font-size: 0.78125rem;
  color: var(--muted-foreground);
}

summary {
  cursor: pointer;
  padding: 6px 0;
  font-weight: 500;
  color: var(--foreground);
}

pre {
  font-size: 0.71875rem;
  line-height: 1.65;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  background: var(--rainflow-surface-inset);
  border-radius: 10px;
  box-shadow: inset 0 0 0 1px var(--rainflow-divider);
  padding: 14px;
  margin: 6px 0 0;
}
</style>
