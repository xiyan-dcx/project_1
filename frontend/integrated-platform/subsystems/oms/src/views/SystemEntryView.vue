<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
const route = useRoute()
const entries: Record<string, { name: string; url: string }> = {
  scheduling: { name: '智能调度', url: 'http://10.166.33.36:5173/' },
  inference: { name: '模型推理', url: 'http://10.166.33.36:8083/' },
  storage: { name: '存算分离', url: 'http://10.166.33.36:5174/system-3/' },
}
const entry = computed(() => entries[String(route.params.system)])
</script>
<template><section v-if="entry"><h2>{{ entry.name }}</h2><p>该模块尚待源码整合，当前保留独立系统入口。</p><a :href="entry.url" target="_blank" rel="noopener noreferrer">打开现有系统</a></section><section v-else><h2>系统入口不存在</h2><RouterLink to="/platform">返回平台概览</RouterLink></section></template>
