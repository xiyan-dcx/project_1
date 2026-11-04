<script setup lang="ts">
import { ArrowRight, Compass } from 'lucide-vue-next'
</script>

<template>
  <section data-slot="empty-state" class="not-found-state" aria-label="页面不存在">
    <span data-slot="icon-badge" class="not-found-icon" aria-hidden="true">
      <Compass :size="20" :stroke-width="1.6" />
    </span>
    <h2>页面不存在</h2>
    <p>所访问的路径不存在或已迁移，请检查地址或返回诊断分析工作台。</p>
    <RouterLink to="/diagnosis" data-slot="button" data-variant="default" class="not-found-link">
      <span>返回诊断分析</span>
      <ArrowRight :size="14" aria-hidden="true" />
    </RouterLink>
  </section>
</template>

<style scoped>
.not-found-state {
  min-height: 360px;
  max-width: 560px;
  margin: 32px auto;
  border-radius: var(--radius-container);
  background: var(--rainflow-surface);
  box-shadow: inset 0 0 0 1px var(--rainflow-divider);
}

.not-found-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
}

.not-found-link {
  margin-top: 8px;
  text-decoration: none;
}
</style>
