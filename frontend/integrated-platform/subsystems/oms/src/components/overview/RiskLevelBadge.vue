<script setup lang="ts">
import { computed } from 'vue'
import { CircleAlert, OctagonAlert, ShieldCheck, TriangleAlert } from 'lucide-vue-next'
import { RISK_LEVELS, type RiskLevel } from '../../api/risk'

const props = defineProps<{ level: RiskLevel; score?: number }>()
const icons = { low: ShieldCheck, attention: CircleAlert, high: TriangleAlert, critical: OctagonAlert }
const label = computed(() => `${RISK_LEVELS[props.level].label}风险${props.score === undefined ? '' : ` · ${props.score}`}`)
</script>

<template>
  <!-- Levels differ by icon, text and border weight, never by color alone. -->
  <span data-slot="badge" :data-level="props.level" class="risk-level-badge tabular-nums" :class="`is-${props.level}`">
    <component :is="icons[props.level]" :size="13" :stroke-width="1.75" aria-hidden="true" />
    <span>{{ label }}</span>
  </span>
</template>

<style scoped>
.risk-level-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 22px;
  padding: 0 9px;
  border: 1px solid var(--border);
  border-radius: var(--radius-4xl);
  font-size: 0.75rem;
  font-weight: 500;
  white-space: nowrap;
  color: var(--muted-foreground);
  background: var(--rainflow-surface-inset);
}

.risk-level-badge.is-attention {
  border-style: dashed;
  border-color: var(--muted-foreground);
  color: var(--foreground);
}

.risk-level-badge.is-high {
  border-color: var(--foreground);
  background: color-mix(in oklch, var(--foreground) 7%, var(--rainflow-surface-inset));
  color: var(--foreground);
}

.risk-level-badge.is-critical {
  border-color: var(--primary);
  background: var(--primary);
  color: var(--primary-foreground);
}
</style>
