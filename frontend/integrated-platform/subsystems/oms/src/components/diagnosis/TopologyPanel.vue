<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useId, watch } from 'vue'
import { RefreshCw } from 'lucide-vue-next'
import { buildTopologyMermaid, getTopologyAnnotations, getRequestError, type DiagnosticTopology, type DiagnosticFinding } from '../../api/diagnosis'

const props = defineProps<{ topology: DiagnosticTopology; primaryHost: string; causes: DiagnosticFinding[] }>()
const diagram = ref('')
const loading = ref(false)
const error = ref('')
const retryCount = ref(0)
const diagramId = `diagnosis-topology-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
const annotations = computed(() => getTopologyAnnotations(props.topology, props.primaryHost, props.causes))
const graphSource = computed(() => buildTopologyMermaid(props.topology, props.primaryHost, props.causes))
let renderVersion = 0

watch([graphSource, retryCount], async (_value, _previous, onCleanup) => {
  const currentVersion = ++renderVersion
  let active = true
  onCleanup(() => { active = false })
  diagram.value = ''
  error.value = ''
  loading.value = props.topology.hosts.length > 0
  if (!loading.value) return

  try {
    const { default: mermaid } = await import('mermaid')
    if (!active) return
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: 'base',
      suppressErrorRendering: true,
      flowchart: { htmlLabels: false, useMaxWidth: true },
      themeVariables: {
        fontFamily: 'system-ui, sans-serif',
        primaryColor: '#fdfdfc',
        primaryTextColor: '#171717',
        primaryBorderColor: '#696969',
        lineColor: '#696969',
        secondaryColor: '#f5f5f3',
        tertiaryColor: '#f0f0ee',
        edgeLabelBackground: '#fdfdfc',
      },
    })
    const result = await mermaid.render(`${diagramId}-${currentVersion}`, graphSource.value)
    if (active && currentVersion === renderVersion) diagram.value = result.svg
  } catch (failure) {
    if (active && currentVersion === renderVersion) error.value = getRequestError(failure)
  } finally {
    if (active && currentVersion === renderVersion) loading.value = false
  }
}, { immediate: true })

onBeforeUnmount(() => { renderVersion += 1 })
</script>

<template>
  <section class="topology-section">
    <h3>输入拓扑</h3>
    <p class="note">实线仅来自 input_context.topology.edges。虚线箭头仅将首要故障主机与候选根因明确列出的已知受影响主机关联，不代表已确认的因果关系或实际网络连接。</p>
    <p v-if="props.topology.description" class="description">{{ props.topology.description }}</p>
    <p v-if="!props.topology.hosts.length" class="empty">诊断记录未提供主机或拓扑数据，不生成占位节点。</p>
    <template v-else>
      <p v-if="!props.topology.edges.length" class="notice">未提供可用的实际连接边。节点与虚线推断关联不表示网络连通关系。</p>
      <p v-if="!props.topology.hasExplicitHosts" class="note">节点来自已知主机记录、诊断明确命名的首要故障主机及输入边端点。</p>
      <ul class="legend" aria-label="拓扑图例">
        <li><span class="primary-marker" aria-hidden="true" />首要故障（模型诊断）</li>
        <li><span class="impact-marker" aria-hidden="true" />受影响（模型标注）</li>
        <li><span class="solid-marker" aria-hidden="true" />实线：输入连接</li>
        <li><span class="dashed-marker" aria-hidden="true" />虚线箭头：推断关联</li>
      </ul>
      <p v-if="props.topology.rejectedEdgeCount" class="note tabular-nums">{{ props.topology.rejectedEdgeCount }} 条缺少端点的边未绘制。</p>
      <div class="diagram-area" :aria-busy="loading">
        <p v-if="loading" role="status">正在加载拓扑渲染器…</p>
        <div v-else-if="error" role="alert" class="render-error">
          <p>拓扑渲染失败：{{ error }}</p>
          <button type="button" data-slot="button" data-variant="outline" data-size="sm" :disabled="loading" @click="retryCount += 1">
            <RefreshCw :size="13" aria-hidden="true" />重试渲染
          </button>
        </div>
        <!-- Only strict-mode Mermaid output from escaped labels is inserted as SVG. -->
        <!-- eslint-disable-next-line vue/no-v-html -->
        <div v-else class="diagram" role="img" aria-label="主机拓扑与模型故障标注，实际连接及推断关联分别见下方列表" v-html="diagram" />
      </div>
      <details class="connections">
        <summary class="tabular-nums">查看主机与原始连接（{{ props.topology.hosts.length }} 个节点 / {{ props.topology.edges.length }} 条输入连接）</summary>
        <p class="host-list monospace">{{ props.topology.hosts.join(' / ') }}</p>
        <ul v-if="props.topology.edges.length">
          <li v-for="(edge, index) in props.topology.edges" :key="index">
            <code>{{ edge.source }}</code> {{ edge.directed ? '→' : '—' }} <code>{{ edge.target }}</code>
          </li>
        </ul>
        <p v-else class="note">没有实际连接边。</p>
      </details>
      <details class="connections">
        <summary class="tabular-nums">模型标注与推断关联（{{ annotations.inferredRelationships.length }} 条，不计入输入连接）</summary>
        <p v-if="props.primaryHost" class="note">首要故障：<span class="monospace">{{ props.primaryHost }}</span></p>
        <p class="note">明确标注的已知受影响主机：<span class="monospace">{{ annotations.impactedHosts.join(' / ') || '未提供' }}</span></p>
        <ul v-if="annotations.inferredRelationships.length">
          <li v-for="relationship in annotations.inferredRelationships" :key="relationship.target">
            <code>{{ relationship.source }}</code> → <code>{{ relationship.target }}</code>（推断关联，非确认传播）
          </li>
        </ul>
        <p v-else class="note">没有满足条件的推断关联，不向其他主机自动补线。</p>
      </details>
    </template>
  </section>
</template>

<style scoped>
h3 {
  font-size: 0.9375rem;
  margin: 0 0 10px;
  font-weight: 500;
}

.note,
.description {
  color: var(--muted-foreground);
  font-size: 0.78125rem;
  line-height: 1.7;
  overflow-wrap: anywhere;
  margin: 0 0 10px;
}

.description {
  color: var(--foreground);
}

.empty {
  padding: 32px 0;
  color: var(--muted-foreground);
  font-size: 0.8125rem;
}

.notice {
  padding: 12px 16px;
  border-left: 2px solid var(--foreground);
  border-radius: 0 var(--radius-element) var(--radius-element) 0;
  background: var(--rainflow-surface-inset);
  box-shadow: inset 0 0 0 1px var(--rainflow-divider);
  font-size: 0.8125rem;
  line-height: 1.65;
  margin: 0 0 14px;
}

.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  list-style: none;
  padding: 0;
  margin: 12px 0;
  font-size: 0.75rem;
  color: var(--muted-foreground);
}

.legend li {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 4px 10px;
  border-radius: var(--radius-4xl);
  background: var(--rainflow-surface-inset);
  box-shadow: inset 0 0 0 1px var(--rainflow-divider);
}

.primary-marker,
.impact-marker {
  width: 13px;
  height: 13px;
  border-radius: 3px;
  border: 2.5px solid var(--foreground);
}

.impact-marker {
  border: 1.5px dashed var(--muted-foreground);
}

.solid-marker,
.dashed-marker {
  width: 20px;
  border-top: 1.5px solid var(--foreground);
}

.dashed-marker {
  border-top-style: dashed;
  border-top-color: var(--muted-foreground);
}

.diagram-area {
  margin-top: 14px;
  min-height: 240px;
  overflow: auto;
  display: grid;
  align-items: center;
  color: var(--muted-foreground);
  font-size: 0.8125rem;
  border-radius: 10px;
  background: var(--rainflow-surface-inset);
  box-shadow: inset 0 0 0 1px var(--rainflow-divider);
  padding: 16px;
}

.diagram {
  padding: 12px 0;
  text-align: center;
}

.diagram :deep(svg) {
  min-width: 280px;
  max-width: 100%;
  height: auto;
}

.render-error {
  padding: 16px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
}

.connections {
  margin-top: 14px;
  padding: 10px 14px;
  border-radius: var(--radius-element);
  background: var(--rainflow-surface-inset);
  box-shadow: inset 0 0 0 1px var(--rainflow-divider);
  font-size: 0.75rem;
  color: var(--muted-foreground);
  line-height: 1.75;
}

summary {
  cursor: pointer;
  padding: 2px 0;
  font-weight: 500;
  color: var(--foreground);
}

.host-list {
  overflow-wrap: anywhere;
  margin: 8px 0 0;
  color: var(--foreground);
}

ul {
  padding-left: 18px;
  margin: 8px 0 0;
}

li {
  padding: 3px 0;
  overflow-wrap: anywhere;
}
</style>
