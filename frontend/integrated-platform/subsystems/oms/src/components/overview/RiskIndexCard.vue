<script setup lang="ts">
import { computed } from 'vue'
import { formatLabel } from '../../api/labels'
import { rootCauseKnowledge } from '../../api/knowledge'
import { RISK_LEVELS, type ClusterRisk, type EventRisk, type RiskTrendPoint } from '../../api/risk'
import RiskLevelBadge from './RiskLevelBadge.vue'

const props = defineProps<{ risk: ClusterRisk; trend: RiskTrendPoint[]; scopeLabel: string }>()
const emit = defineEmits<{ select: [recordId: string] }>()

const CHART_WIDTH = 280
const CHART_HEIGHT = 56
const CHART_PADDING = 5

const topEvent = computed<EventRisk | null>(() => props.risk.events[0] ?? null)

const deltaText = computed(() => {
  if (props.trend.length < 2) return ''
  const latestPoint = props.trend[props.trend.length - 1]
  const previousPoint = props.trend[props.trend.length - 2]
  if (!latestPoint || !previousPoint) return ''
  const delta = latestPoint.score - previousPoint.score
  if (delta === 0) return '与昨日持平'
  return `较昨日 ${delta > 0 ? '+' : '−'}${Math.abs(delta)}`
})

function chartY(score: number): number {
  return CHART_PADDING + (1 - score / 100) * (CHART_HEIGHT - CHART_PADDING * 2)
}

const chartPoints = computed(() => props.trend.map((point, index) => ({
  x: props.trend.length > 1 ? CHART_PADDING + index * (CHART_WIDTH - CHART_PADDING * 2) / (props.trend.length - 1) : CHART_WIDTH / 2,
  y: chartY(point.score),
  score: point.score,
  label: index === props.trend.length - 1 ? '今天' : `${point.at.getMonth() + 1}/${point.at.getDate()}`,
})))

const chartDescription = computed(() =>
  `近 ${props.trend.length} 天风险指数：${chartPoints.value.map((point) => `${point.label} ${point.score}`).join('，')}`)

function statusText(eventRisk: EventRisk): string {
  return eventRisk.record.status ? formatLabel(eventRisk.record.status) : '实验记录'
}

function eventTitle(eventRisk: EventRisk): string {
  return rootCauseKnowledge(eventRisk.record.root_cause_category).title
}

function formula(eventRisk: EventRisk): string {
  const { category, scope, confidence, recency, impactedHosts, totalHosts } = eventRisk.factors
  const reach = impactedHosts > 0 ? `${impactedHosts}/${totalHosts} 台` : '范围未知'
  return `性质 ${category.toFixed(1)} × 范围 ${scope.toFixed(2)}（${reach}）× 置信度 ${confidence.toFixed(1)} × 时效 ${recency.toFixed(2)} = ${Math.round(eventRisk.score)}`
}
</script>

<template>
  <article data-slot="card" class="risk-index-card" aria-labelledby="risk-index-title">
    <div class="risk-card-header">
      <h3 id="risk-index-title" data-slot="card-title" class="risk-card-title">集群风险指数</h3>
      <span data-slot="badge" class="risk-scope">{{ props.scopeLabel }}</span>
    </div>

    <div class="risk-body">
      <div class="risk-score-block">
        <div class="risk-score-line">
          <span class="risk-score tabular-nums">{{ props.risk.score }}</span>
          <span class="risk-unit">/ 100</span>
        </div>
        <RiskLevelBadge :level="props.risk.level" />
        <p class="risk-advice">{{ RISK_LEVELS[props.risk.level].advice }}</p>
      </div>

      <figure class="risk-trend">
        <svg :viewBox="`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`" role="img" :aria-label="chartDescription" preserveAspectRatio="none">
          <line
            v-for="threshold in [20, 50, 80]" :key="threshold" class="trend-threshold"
            :x1="0" :x2="CHART_WIDTH" :y1="chartY(threshold)" :y2="chartY(threshold)"
          />
          <polyline class="trend-line" :points="chartPoints.map((point) => `${point.x},${point.y}`).join(' ')" />
          <circle
            v-for="(point, index) in chartPoints" :key="index" class="trend-point"
            :class="{ 'is-current': index === chartPoints.length - 1 }" :cx="point.x" :cy="point.y" r="2.75"
          />
        </svg>
        <div v-if="chartPoints.length" class="trend-labels tabular-nums" aria-hidden="true">
          <span>{{ chartPoints[0]?.label }}</span>
          <span>{{ chartPoints[chartPoints.length - 1]?.label }}</span>
        </div>
        <figcaption class="trend-caption tabular-nums">近 7 天 · {{ deltaText }}</figcaption>
      </figure>
    </div>

    <p v-if="topEvent" class="risk-source">
      主要来源：{{ eventTitle(topEvent) }}（<span class="monospace">{{ topEvent.record.primary_failed_host || '主机未明确' }}</span>，{{ statusText(topEvent) }}），单项风险 <span class="tabular-nums">{{ Math.round(topEvent.score) }}</span>。
      <button type="button" class="text-button" @click="emit('select', topEvent.record.record_id)">查看事件</button>
    </p>
    <p v-else class="risk-source">当前没有未恢复的故障事件。</p>

    <details class="risk-breakdown">
      <summary>分数构成与计算规则</summary>
      <ol v-if="props.risk.events.length">
        <li v-for="item in props.risk.events.slice(0, 5)" :key="item.record.record_id">
          <span>{{ eventTitle(item) }} · <span class="monospace">{{ item.record.event_id }}</span></span>
          <span class="risk-formula tabular-nums">{{ formula(item) }}</span>
        </li>
      </ol>
      <p class="risk-method">
        每个未恢复事件的单项风险 = 100 × 故障性质 × 影响范围 × 置信度 × 时效；多个事件按
        100 × (1 − ∏(1 − 单项 ÷ 100)) 叠加，不超过 100。时效在故障后 24 小时内为 1，之后每 3 天减半，最低 0.3。
        标记为“已恢复”的事件不再计入。
      </p>
    </details>
  </article>
</template>

<style scoped>
.risk-index-card {
  grid-column: span 2;
  padding: 18px 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}

.risk-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.risk-card-title {
  color: var(--muted-foreground);
  font-size: 0.8125rem;
}

.risk-scope {
  font-size: 0.6875rem;
}

.risk-body {
  display: grid;
  grid-template-columns: minmax(145px, auto) minmax(0, 1fr);
  gap: 20px;
  align-items: center;
}

.risk-score-block {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
}

.risk-score-line {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.risk-score {
  font-size: 2.375rem;
  font-weight: 500;
  letter-spacing: -0.03em;
  line-height: 1;
  color: var(--foreground);
}

.risk-unit {
  font-size: 0.8125rem;
  color: var(--muted-foreground);
}

.risk-advice {
  font-size: 0.78125rem;
  color: var(--muted-foreground);
  line-height: 1.5;
  margin: 0;
}

.risk-trend {
  margin: 0;
  min-width: 0;
  padding: 10px 12px 8px;
  border-radius: var(--radius-element);
  background: var(--rainflow-surface-inset);
  box-shadow: inset 0 0 0 1px var(--rainflow-divider);
}

.risk-trend svg {
  display: block;
  width: 100%;
  height: 54px;
  overflow: visible;
}

.trend-threshold {
  stroke: var(--border);
  stroke-dasharray: 3 3;
  stroke-width: 1;
  vector-effect: non-scaling-stroke;
}

.trend-line {
  fill: none;
  stroke: var(--foreground);
  stroke-width: 1.5;
  vector-effect: non-scaling-stroke;
}

.trend-point {
  fill: var(--rainflow-surface-inset);
  stroke: var(--foreground);
  stroke-width: 1.5;
  vector-effect: non-scaling-stroke;
}

.trend-point.is-current {
  fill: var(--foreground);
}

.trend-labels {
  display: flex;
  justify-content: space-between;
  margin-top: 6px;
  font-size: 0.6875rem;
  color: var(--muted-foreground);
}

.trend-caption {
  margin-top: 2px;
  font-size: 0.75rem;
  color: var(--foreground);
}

.risk-source {
  margin: 0;
  padding-top: 12px;
  border-top: 1px solid var(--rainflow-divider);
  font-size: 0.8125rem;
  line-height: 1.6;
  color: var(--foreground);
}

.risk-source .text-button {
  font-size: 0.8125rem;
  margin-left: 6px;
}

.risk-breakdown summary {
  cursor: pointer;
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--muted-foreground);
  transition: color var(--duration-fast) var(--ease-out-cubic);
}

.risk-breakdown summary:hover {
  color: var(--foreground);
}

.risk-breakdown ol {
  margin: 10px 0 0;
  padding-left: 18px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 0.75rem;
  color: var(--foreground);
}

.risk-breakdown li {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.risk-formula {
  color: var(--muted-foreground);
}

.risk-method {
  margin: 8px 0 0;
  font-size: 0.75rem;
  line-height: 1.65;
  color: var(--muted-foreground);
}

@media (max-width: 1200px) {
  .risk-index-card {
    grid-column: 1 / -1;
  }
}

@media (max-width: 600px) {
  .risk-body {
    grid-template-columns: 1fr;
    gap: 12px;
  }
}
</style>
