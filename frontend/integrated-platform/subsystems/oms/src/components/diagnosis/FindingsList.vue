<script setup lang="ts">
import type { DiagnosticFinding } from '../../api/diagnosis'
import { formatLabel } from '../../api/labels'
import EvidenceList from './EvidenceList.vue'

const props = defineProps<{ findings: DiagnosticFinding[]; emptyText?: string }>()
</script>

<template>
  <p v-if="!props.findings.length" class="empty">{{ props.emptyText || '暂无分析数据。' }}</p>
  <ol v-else class="findings">
    <li v-for="(finding, index) in props.findings" :key="index" class="finding-item">
      <div class="finding-heading">
        <span class="number monospace tabular-nums">{{ String(index + 1).padStart(2, '0') }}</span>
        <h4>{{ finding.title || '分析发现' }}</h4>
      </div>
      <p v-if="finding.description">{{ finding.description }}</p>
      <dl v-if="finding.confidence || finding.severity || finding.hosts.length || finding.services.length" class="finding-meta">
        <div v-if="finding.confidence"><dt>置信度</dt><dd class="tag">{{ formatLabel(finding.confidence) }}</dd></div>
        <div v-if="finding.severity"><dt>严重度</dt><dd class="tag">{{ formatLabel(finding.severity) }}</dd></div>
        <div v-if="finding.hosts.length"><dt>影响主机</dt><dd class="monospace-tag tabular-nums">{{ finding.hosts.join(' / ') }}</dd></div>
        <div v-if="finding.services.length"><dt>影响服务</dt><dd class="tag">{{ finding.services.join(' / ') }}</dd></div>
      </dl>
      <EvidenceList :evidence="finding.evidence" />
    </li>
  </ol>
</template>

<style scoped>
.findings {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.finding-item {
  padding: 15px 18px;
  background: var(--rainflow-surface-inset);
  border-radius: 10px;
  box-shadow: inset 0 0 0 1px var(--rainflow-divider);
}

.finding-heading {
  display: flex;
  align-items: center;
  gap: 10px;
}

.number {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 22px;
  border-radius: 6px;
  background: var(--rainflow-surface-strong);
  color: var(--muted-foreground);
  font-size: 0.6875rem;
  font-weight: 500;
  flex-shrink: 0;
}

h4 {
  font-size: 0.84375rem;
  font-weight: 500;
  margin: 0;
  line-height: 1.5;
  color: var(--foreground);
  overflow-wrap: anywhere;
}

p {
  font-size: 0.8125rem;
  line-height: 1.7;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  margin: 10px 0 0;
  color: var(--foreground);
}

.empty {
  color: var(--muted-foreground);
  padding: 16px 0;
  font-size: 0.8125rem;
  margin: 0;
}

.finding-meta {
  display: flex;
  gap: 8px 14px;
  flex-wrap: wrap;
  margin: 12px 0 0;
  font-size: 0.75rem;
  line-height: 1.5;
}

.finding-meta > div {
  display: flex;
  align-items: center;
  gap: 6px;
}

dt {
  color: var(--muted-foreground);
  flex-shrink: 0;
}

dd {
  margin: 0;
  overflow-wrap: anywhere;
}

.tag,
.monospace-tag {
  background: var(--rainflow-surface);
  box-shadow: inset 0 0 0 1px var(--rainflow-divider);
  padding: 2px 8px;
  border-radius: var(--radius-4xl);
  color: var(--foreground);
  font-weight: 500;
}

.monospace-tag {
  font-family: var(--font-mono);
  border-radius: 6px;
}
</style>
