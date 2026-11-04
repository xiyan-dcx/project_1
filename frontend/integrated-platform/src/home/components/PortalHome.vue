<script setup lang="ts">
import { IconArrowRight, IconLayoutList } from '@tabler/icons-vue'
import { useI18n } from 'vue-i18n'
import { operatingMetrics } from '../config/demo-data'
import DecisionTrend from './DecisionTrend.vue'
import TopologyPanel from './TopologyPanel.vue'
import ModuleGrid from './ModuleGrid.vue'
import MetricValue from './MetricValue.vue'
import AppLink from './ui/AppLink.vue'
const { t } = useI18n()
</script>

<template>
  <div class="portal-home content-reveal">
    <section class="portal-hero" aria-labelledby="page-title" data-visual-region="page-heading">
      <div class="hero-copy"><p class="hero-eyebrow"><span aria-hidden="true"></span>{{ t('Three layer collaboration') }}</p>
        <h1 id="page-title"><span>{{ t('Collaborative endogenous intelligence') }}</span><span>{{ t('Intelligent decision system') }}</span></h1>
        <p class="hero-description">{{ t('Portal hero description') }}</p>
        <div class="hero-actions"><AppLink href="#modules">{{ t('Enter decision console') }}<IconArrowRight :size="14" stroke="1.5" aria-hidden="true" /></AppLink><AppLink href="#architecture" variant="ghost">{{ t('View architecture') }}</AppLink></div>
        <p class="hero-note"><IconLayoutList :size="14" stroke="1.5" aria-hidden="true" />{{ t('Independent modules note') }}</p>
      </div>
      <DecisionTrend />
    </section>
    <TopologyPanel />
    <ModuleGrid />
    <section id="metrics" class="operating-section" aria-labelledby="operating-title"><div class="section-heading"><div><h2 id="operating-title">{{ t('Operating metrics') }}</h2><p>{{ t('Operating description') }}</p></div></div><dl class="operating-metrics" data-slot="card"><MetricValue v-for="metric in operatingMetrics" :key="metric.labelKey" :metric="metric" /></dl></section>
    <p class="data-note">{{ t('Demo disclaimer') }}</p>
  </div>
</template>
