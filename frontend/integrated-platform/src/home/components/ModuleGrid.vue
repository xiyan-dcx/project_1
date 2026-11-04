<script setup lang="ts">
import { IconArrowRight } from '@tabler/icons-vue'
import { useI18n } from 'vue-i18n'
import { systems } from '../config/systems'
import { moduleLayers, moduleMetrics } from '../config/demo-data'
import MetricValue from './MetricValue.vue'
const { t } = useI18n()
</script>

<template>
  <section id="modules" class="module-section" aria-labelledby="modules-title">
    <div class="section-heading"><div><h2 id="modules-title">{{ t('Four modules') }}</h2><p>{{ t('Modules description') }}</p></div><span class="section-meta">{{ t('Four demo entries') }}</span></div>
    <div class="module-grid">
      <article v-for="system in systems" :key="system.id" class="module-card" data-slot="card">
        <div class="module-top"><span class="small-icon"><component :is="system.icon" :size="18" stroke="1.5" aria-hidden="true" /></span><span class="module-number">{{ system.number }}</span></div>
        <h3>{{ t(system.titleKey) }}</h3>
        <span class="module-layer" data-slot="badge">{{ t(moduleLayers[system.id]!) }}</span>
        <p class="module-description">{{ t(system.descriptionKey) }}</p>
        <dl class="module-metrics"><MetricValue v-for="metric in moduleMetrics[system.id]" :key="metric.labelKey" :metric="metric" /></dl>
        <a :href="system.href" class="module-link" data-slot="button" data-variant="link" data-size="default" :aria-label="`${t('Enter module')}：${t(system.titleKey)}`">{{ t('Enter module') }}<IconArrowRight :size="14" stroke="1.5" aria-hidden="true" /></a>
      </article>
    </div>
  </section>
</template>
