<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { systems } from '../config/systems'
const { t } = useI18n()
</script>

<template>
  <section id="overview" class="overview-section" aria-labelledby="overview-title">
    <div class="overview-heading"><h2 id="overview-title">{{ t('Research framework') }}</h2><p>{{ t('Framework description') }}</p></div>
    <div class="framework-grid">
      <div v-for="system in systems" :key="system.id" class="framework-item">
        <span class="framework-icon"><component :is="system.icon" :size="18" stroke="1.5" aria-hidden="true" /></span>
        <div><span class="framework-layer">{{ t(system.layerKey) }}</span><h3>{{ t(system.questionKey) }}</h3></div>
        <span class="framework-index" aria-hidden="true">{{ system.number }}</span>
      </div>
    </div>
  </section>
</template>
