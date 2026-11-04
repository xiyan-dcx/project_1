<script setup lang="ts">
import { IconBolt } from '@tabler/icons-vue'
import { useI18n } from 'vue-i18n'
import { overviewMetrics, requestHistory } from '../config/demo-data'
import MetricValue from './MetricValue.vue'
const { t } = useI18n()
</script>

<template>
  <aside class="decision-trend" data-slot="card" aria-labelledby="trend-title">
    <div class="trend-header"><h2 id="trend-title"><IconBolt :size="15" stroke="1.5" aria-hidden="true" />{{ t('Decision trend') }}</h2><span class="demo-label"><i aria-hidden="true"></i>{{ t('Demo data') }}</span></div>
    <dl class="trend-metrics"><MetricValue v-for="metric in overviewMetrics" :key="metric.labelKey" :metric="metric" /></dl>
    <div class="request-chart" role="img" :aria-label="t('Chart description')">
      <span v-for="(value, index) in requestHistory" :key="index" :style="{ height: `${value}%` }" :class="{ 'latest-bar': index === requestHistory.length - 1 }"></span>
    </div>
    <p class="chart-caption">{{ t('Chart caption') }}</p>
  </aside>
</template>
