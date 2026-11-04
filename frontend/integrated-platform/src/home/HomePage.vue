<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { IconTopologyStar3, IconMoon, IconSun, IconArrowLeft, IconArrowUpRight } from '@tabler/icons-vue'
import { useI18n } from 'vue-i18n'
import { systems as sourceSystems } from './config/systems'
const systems = sourceSystems.map(system => ({ ...system, href: system.id === 'fault-diagnosis' ? '/oms/' : system.id === 'model-inference' ? '/inference/' : system.id === 'storage-compute' ? '/system-3/' : system.id === 'intelligent-scheduling' ? '/scheduler/' : system.href }))
import SystemCard from './components/SystemCard.vue'
import CollaborationDiagram from './components/CollaborationDiagram.vue'
import ResearchOverview from './components/ResearchOverview.vue'
import AppLink from './components/ui/AppLink.vue'

const { t } = useI18n()
const hash = ref(window.location.hash)
const isSystemPage = computed(() => hash.value.startsWith('#/'))
const selectedSystem = computed(() => systems.find(system => `#/systems/${system.id}` === hash.value))
const dark = ref(document.documentElement.classList.contains('dark'))

function toggleTheme() {
  dark.value = !dark.value
  document.documentElement.classList.toggle('dark', dark.value)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark.value ? '#222222' : '#fdfdfc')
  try { localStorage.setItem('snowapi-portal-theme', dark.value ? 'dark' : 'light') } catch { /* Theme persistence is optional. */ }
}

function updateRoute() { hash.value = window.location.hash }

watch(hash, async (value, previous) => {
  document.title = selectedSystem.value
    ? `${t(selectedSystem.value.titleKey)} | ${t('Collaborative endogenous intelligence')}${t('Intelligent decision system')}`
    : '首页'
  await nextTick()
  if (value.startsWith('#/') || previous.startsWith('#/')) {
    window.scrollTo({ top: 0, behavior: 'instant' })
    document.querySelector<HTMLElement>('main')?.focus({ preventScroll: true })
  }
  if (value === '#systems' || value === '#overview') {
    document.querySelector(value)?.scrollIntoView()
  }
})

onMounted(() => { document.title = '首页'; window.addEventListener('hashchange', updateRoute) })
onUnmounted(() => window.removeEventListener('hashchange', updateRoute))
</script>

<template>
 <div class="portal-home">
  <a class="skip-link" href="#main">{{ t('Skip to content') }}</a>
  <header class="site-header">
    <div class="header-inner">
      <a class="brand" href="#" :aria-label="t('Home')">
        <span class="brand-symbol"><IconTopologyStar3 :size="23" stroke="1.5" aria-hidden="true" /></span>
        <span class="brand-copy"><strong>{{ t('Cloud edge device collaboration') }}</strong><span>{{ t('Research platform') }}</span></span>
      </a>
      <nav class="header-nav" :aria-label="t('Research platform')">
        <a href="#" :class="{ active: !isSystemPage }" :aria-current="!isSystemPage ? 'page' : undefined">{{ t('Home') }}</a>
        <a href="#systems">{{ t('Research systems') }}</a>
        <a href="#overview">{{ t('Research overview') }}</a>
      </nav>
      <button class="theme-toggle" type="button" data-slot="button" data-variant="ghost" data-size="icon" :aria-label="t(dark ? 'Switch to light mode' : 'Switch to dark mode')" :title="t(dark ? 'Switch to light mode' : 'Switch to dark mode')" @click="toggleTheme"><component :is="dark ? IconSun : IconMoon" :size="16" stroke="1.5" aria-hidden="true" /></button>
    </div>
  </header>

  <main id="main" class="page-shell" tabindex="-1">
    <template v-if="!isSystemPage">
      <section class="hero content-reveal" aria-labelledby="page-title" data-visual-region="page-heading">
        <div class="hero-copy">
          <p class="hero-eyebrow"><span class="eyebrow-line" aria-hidden="true"></span>{{ t('Intelligence across every layer') }}</p>
          <h1 id="page-title">{{ t('Collaborative endogenous intelligence') }}<br />{{ t('Intelligent decision system') }}</h1>
          <p class="hero-description">{{ t('Hero description') }}</p>
        </div>
        <CollaborationDiagram />
      </section>
      <section id="systems" class="systems-section" aria-labelledby="systems-title" data-visual-region="page-content">
        <div class="section-heading"><h2 id="systems-title">{{ t('Four systems one research vision') }}</h2><p>{{ t('Systems description') }}</p></div>
        <div class="systems-grid"><SystemCard v-for="system in systems" :key="system.id" :system="system" /></div>
      </section>
      <ResearchOverview />
    </template>

    <section v-else class="placeholder-page content-reveal" :key="hash" aria-labelledby="placeholder-title">
      <AppLink href="#" variant="ghost"><IconArrowLeft :size="16" stroke="1.5" aria-hidden="true" />{{ t('Back to home') }}</AppLink>
      <div class="placeholder-panel" data-slot="card">
        <template v-if="selectedSystem">
          <span class="icon-badge placeholder-icon"><component :is="selectedSystem.icon" :size="32" stroke="1.5" aria-hidden="true" /></span>
          <p class="placeholder-eyebrow">{{ t(selectedSystem.layerKey) }} / {{ t('Demonstration entry') }}</p>
          <h1 id="placeholder-title">{{ t(selectedSystem.titleKey) }}</h1>
          <p class="placeholder-description">{{ t(selectedSystem.descriptionKey) }}</p>
          <div class="integration-note"><h2>{{ t('Integration pending') }}</h2><p>{{ t('Placeholder description') }}</p></div>
        </template>
        <template v-else><h1 id="placeholder-title">{{ t('Page not found') }}</h1><p>{{ t('Unknown system description') }}</p></template>
        <AppLink href="#">{{ t('Back to home') }}<IconArrowUpRight :size="16" stroke="1.5" aria-hidden="true" /></AppLink>
      </div>
      <h2 class="other-systems-title">{{ t('Other research systems') }}</h2>
      <div class="other-systems">
        <AppLink v-for="system in systems.filter(item => item.id !== selectedSystem?.id)" :key="system.id" :href="system.href" variant="secondary">
          {{ t(system.titleKey) }}<IconArrowUpRight :size="16" stroke="1.5" aria-hidden="true" />
        </AppLink>
      </div>
    </section>
  </main>

  <footer class="site-footer"><div class="footer-inner"><p>{{ t('Research achievement portal') }}</p><p>{{ t('Footer note') }}</p></div></footer>
</div>
</template>



