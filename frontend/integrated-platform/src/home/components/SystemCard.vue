<script setup lang="ts">
import { IconArrowUpRight } from '@tabler/icons-vue'
import { useI18n } from 'vue-i18n'
import type { ResearchSystem } from '../config/systems'
import AppLink from './ui/AppLink.vue'

const props = defineProps<{ system: ResearchSystem }>()
const { t } = useI18n()
</script>

<template>
  <article class="system-card" data-slot="card" data-size="default">
    <div class="system-card-top">
      <span class="icon-badge" data-slot="icon-badge" data-size="lg">
        <component :is="props.system.icon" :size="24" stroke="1.5" aria-hidden="true" />
      </span>
      <span class="layer-label" data-slot="badge">{{ t(props.system.layerKey) }}</span>
    </div>
    <div class="system-card-heading">
      <h3 data-slot="card-title">{{ t(props.system.titleKey) }}</h3>
      <p class="english-name" lang="en">{{ props.system.english }}</p>
    </div>
    <p class="card-description" data-slot="card-description">{{ t(props.system.descriptionKey) }}</p>
    <ul class="tags" :aria-label="t(props.system.titleKey)"><li v-for="tag in props.system.tagKeys" :key="tag">{{ t(tag) }}</li></ul>
    <AppLink :href="props.system.href" :aria-label="`${t('Enter system')}：${t(props.system.titleKey)}`">
      {{ t('Enter system') }}<IconArrowUpRight :size="16" stroke="1.5" aria-hidden="true" />
    </AppLink>
    <span class="card-number" aria-hidden="true">{{ props.system.number }}</span>
  </article>
</template>
