<script setup lang="ts">
import type { DiagnosisDetail } from '../../api/diagnosis'
import { formatLabel } from '../../api/labels'

const props = defineProps<{ diagnosis: DiagnosisDetail }>()
</script>

<template>
  <div class="summary">
    <dl class="metrics">
      <div class="metric-card">
        <dt>整体严重度</dt>
        <dd>{{ formatLabel(props.diagnosis.severity) }}</dd>
      </div>
      <div class="metric-card">
        <dt>首要故障主机</dt>
        <dd class="host monospace tabular-nums">{{ props.diagnosis.primaryHost || '尚未确定' }}</dd>
      </div>
      <div class="metric-card">
        <dt>根因类别</dt>
        <dd>{{ formatLabel(props.diagnosis.category) }}</dd>
      </div>
      <div class="metric-card">
        <dt>置信度</dt>
        <dd>{{ formatLabel(props.diagnosis.confidence) }}</dd>
      </div>
    </dl>

    <section class="section-block">
      <h3>诊断结论</h3>
      <div class="statement-card">
        <p class="statement">{{ props.diagnosis.statement || '诊断文件未提供最终结论。' }}</p>
      </div>
    </section>

    <section class="section-block">
      <h3>事件摘要</h3>
      <p class="summary-text">{{ props.diagnosis.summary || '暂无摘要信息。' }}</p>
    </section>

    <section v-if="props.diagnosis.rationale" class="section-block">
      <h3>鉴别诊断依据</h3>
      <p class="summary-text">{{ props.diagnosis.rationale }}</p>
    </section>

    <p class="note">以上为诊断模型的分析结果，置信度不等同于已确认事实；请结合传播证据与主机日志复核。</p>
  </div>
</template>

<style scoped>
.summary {
  max-width: 900px;
}

.metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  margin: 0 0 24px;
  padding: 0;
}

.metric-card {
  background: var(--rainflow-surface-inset);
  border-radius: 10px;
  box-shadow: inset 0 0 0 1px var(--rainflow-divider);
  padding: 13px 15px;
}

dt {
  font-size: 0.75rem;
  color: var(--muted-foreground);
  margin-bottom: 6px;
  font-weight: 400;
}

dd {
  margin: 0;
  font-size: 0.875rem;
  font-weight: 500;
  line-height: 1.45;
  color: var(--foreground);
  overflow-wrap: anywhere;
}

.host {
  font-size: 0.84375rem;
}

.section-block {
  margin-top: 22px;
}

h3 {
  font-size: 0.8125rem;
  margin: 0 0 8px;
  font-weight: 500;
  color: var(--muted-foreground);
}

.statement-card {
  background: var(--rainflow-surface-inset);
  border-left: 2px solid var(--foreground);
  border-radius: 0 10px 10px 0;
  box-shadow: inset 0 0 0 1px var(--rainflow-divider);
  padding: 14px 18px;
}

.statement {
  color: var(--foreground);
  font-size: 0.90625rem;
  font-weight: 500;
  line-height: 1.65;
  margin: 0;
}

.summary-text {
  line-height: 1.75;
  font-size: 0.84375rem;
  margin: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  color: var(--foreground);
}

.note {
  margin: 26px 0 0;
  color: var(--muted-foreground);
  font-size: 0.75rem;
  line-height: 1.65;
  border-top: 1px solid var(--rainflow-divider);
  padding-top: 14px;
}

@media (max-width: 900px) {
  .metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 520px) {
  .metrics {
    grid-template-columns: 1fr;
  }
}
</style>
