<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { Metric } from '../config/demo-data'
const props = defineProps<{ metric: Metric }>()
const { t } = useI18n()
</script>

<template>
  <div class="metric-value" data-slot="metric">
    <dt>{{ t(props.metric.labelKey) }}</dt>
    <dd>{{ props.metric.value }}<span v-if="props.metric.unit" class="metric-unit">{{ props.metric.unit }}</span></dd>
  </div>
</template>
