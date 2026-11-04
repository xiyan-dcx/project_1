<script setup lang="ts">
import type { HostRisk } from '../../api/risk'
import RiskLevelBadge from './RiskLevelBadge.vue'

const props = defineProps<{ hosts: HostRisk[]; focusedRecordId: string }>()
const emit = defineEmits<{ select: [recordId: string] }>()

function roleText(host: HostRisk): string {
  if (host.score === 0) return '无未恢复故障'
  return host.isPrimary ? '故障发源主机' : '受故障波及'
}
</script>

<template>
  <p v-if="props.hosts.length === 0" class="host-matrix-empty">
    暂无诊断记录，主机会在首次诊断完成后出现在这里。
  </p>
  <template v-else>
    <ul class="host-matrix" aria-label="主机风险等级">
      <li v-for="host in props.hosts" :key="host.hostIp">
        <button
          type="button"
          class="host-card"
          :class="[`is-${host.level}`, { 'is-focused': host.topEvent?.record_id === props.focusedRecordId && host.score > 0 }]"
          :disabled="!host.topEvent"
          :aria-label="`主机 ${host.hostIp}，${roleText(host)}，风险 ${host.score}`"
          @click="host.topEvent && emit('select', host.topEvent.record_id)"
        >
          <span class="host-card-top">
            <span class="host-ip monospace tabular-nums">{{ host.hostIp }}</span>
            <RiskLevelBadge :level="host.level" :score="host.score" />
          </span>
          <span class="host-role">{{ roleText(host) }}</span>
          <span v-if="host.topEvent" class="host-summary" :title="host.topEvent.summary">{{ host.topEvent.summary }}</span>
        </button>
      </li>
    </ul>
    <p class="host-matrix-legend">
      边框线型：双倍实线为严重，单实线为高，虚线为关注，细线为低。发源主机按事件单项风险计，受波及主机按一半计。
    </p>
  </template>
</template>

<style scoped>
.host-matrix-empty {
  font-size: 0.8125rem;
  color: var(--muted-foreground);
  margin: 0;
  padding: 28px 0;
}

.host-matrix {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.host-card {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 13px 14px;
  text-align: left;
  color: var(--foreground);
  background: var(--rainflow-surface-inset);
  border: 1px solid var(--border);
  border-radius: 10px;
  transition:
    background-color var(--duration-fast) var(--ease-out-cubic),
    border-color var(--duration-fast) var(--ease-out-cubic),
    box-shadow var(--duration-fast) var(--ease-out-cubic);
}

.host-card:hover:not(:disabled) {
  background: color-mix(in oklch, var(--foreground) 3%, var(--rainflow-surface-inset));
  border-color: var(--oms-border-hover);
}

.host-card:disabled {
  cursor: default;
}

.host-card.is-attention {
  border-style: dashed;
  border-color: var(--muted-foreground);
}

.host-card.is-high {
  border-color: var(--foreground);
}

.host-card.is-critical {
  border: 2px solid var(--foreground);
  padding: 12px 13px;
}

.host-card.is-focused {
  background: var(--rainflow-surface-strong);
  box-shadow: 0 0 0 1px var(--foreground);
}

.host-card-top {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 6px 8px;
}

.host-ip {
  font-size: 0.84375rem;
  font-weight: 500;
}

.host-role {
  font-size: 0.75rem;
  color: var(--muted-foreground);
}

.host-summary {
  font-size: 0.75rem;
  color: var(--muted-foreground);
  line-height: 1.55;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.host-matrix-legend {
  margin: 2px 0 0;
  font-size: 0.75rem;
  line-height: 1.6;
  color: var(--muted-foreground);
}

@media (max-width: 768px) {
  .host-matrix {
    grid-template-columns: 1fr;
  }
}
</style>
