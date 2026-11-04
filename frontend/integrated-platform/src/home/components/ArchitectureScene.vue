<script setup lang="ts">
import { ref } from 'vue'
import { IconArrowUpRight } from '@tabler/icons-vue'
import { useI18n } from 'vue-i18n'
import { systems } from '../config/systems'
import AppLink from './ui/AppLink.vue'
import sceneImage from '../assets/architecture-scene.png'

const { t } = useI18n()
const active = ref<string | null>(null)
const captions: Record<string, string> = {
  'fault-diagnosis': 'Diagnosis caption',
  'intelligent-scheduling': 'Scheduling caption',
  'model-inference': 'Inference caption',
  'storage-compute': 'Storage caption',
}
</script>

<template>
  <section class="architecture-scene content-reveal" aria-labelledby="page-title" :data-active="active">
    <img class="scene-image" :src="sceneImage" :alt="t('Architecture illustration')" fetchpriority="high" width="1600" height="1000" />
    <div class="exhibition-title" data-visual-region="page-heading">
      <h1 id="page-title"><span>{{ t('Collaborative endogenous intelligence') }}</span><span>{{ t('Intelligent decision system') }}</span></h1>
      <p>{{ t('Research exhibition') }}</p>
    </div>
    <div class="tier-annotations" aria-hidden="true"><span class="cloud-label">{{ t('Cloud tier') }}</span><span class="edge-label">{{ t('Edge nodes') }}</span><span class="device-label">{{ t('End devices') }}</span></div>
    <svg class="callout-lines" viewBox="0 0 1600 1000" fill="none" aria-hidden="true">
      <g data-line="storage-compute"><path d="M 1280 285 H 1190 L 1100 378" /><circle cx="1100" cy="378" r="5" /></g>
      <g data-line="intelligent-scheduling"><path d="M 284 487 H 346 L 452 548" /><circle cx="452" cy="548" r="5" /></g>
      <g data-line="model-inference"><path d="M 1310 554 H 1236 L 1162 620" /><circle cx="1162" cy="620" r="5" /></g>
      <g data-line="fault-diagnosis"><path d="M 205 734 H 238 L 298 777" /><circle cx="298" cy="777" r="5" /></g>
    </svg>
    <div id="systems" class="scene-entries" :aria-label="t('Research systems')">
      <article v-for="system in systems" :key="system.id" class="scene-entry" :class="`entry-${system.id}`" data-slot="system-entry"
        @mouseenter="active = system.id" @mouseleave="active = null" @focusin="active = system.id" @focusout="active = null">
        <span class="entry-layer">{{ t(system.layerKey) }}</span>
        <h2>{{ t(system.titleKey) }}</h2>
        <p>{{ t(captions[system.id]!) }}</p>
        <AppLink :href="system.href" size="lg" :aria-label="`${t('Enter system')}：${t(system.titleKey)}`">
          {{ t('Enter system') }}<IconArrowUpRight :size="16" stroke="1.5" aria-hidden="true" />
        </AppLink>
      </article>
    </div>
  </section>
</template>
