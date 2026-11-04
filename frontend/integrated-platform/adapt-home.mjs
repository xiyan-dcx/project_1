import fs from 'node:fs/promises';
let home=await fs.readFile('src/home/HomePage.vue','utf8');
home=home.replace("import { systems } from './config/systems'", "import { systems as sourceSystems } from './config/systems'\nimport { useRouter } from 'vue-router'\nconst router = useRouter()\nconst systems = sourceSystems.map(system => ({ ...system, href: system.id === 'fault-diagnosis' ? '/overview' : system.id === 'model-inference' ? 'http://10.166.33.36:8083/' : system.id === 'storage-compute' ? 'http://10.166.33.36:5174/system-3/' : system.href }))\nfunction navigate(event: MouseEvent) {\n  const link = (event.target as Element).closest('a')\n  if (link?.getAttribute('href') === '/overview' && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey && event.button === 0) { event.preventDefault(); void router.push('/overview') }\n}");
home=home.replace('<template>','<template>\n <div class="portal-home" @click="navigate">');
const last=home.lastIndexOf('</template>');home=home.slice(0,last)+'</div>\n'+home.slice(last);
await fs.writeFile('src/home/HomePage.vue',home);
await fs.copyFile('src/App.vue','src/OmsLayout.vue');
let oms=await fs.readFile('src/OmsLayout.vue','utf8');
oms=oms.replace(/  \{ path: '\/platform'.*\n/, '');
oms=oms.replace(/navigation.push\([\s\S]*?\n\)\n/, '');
oms=oms.replace("label: '故障诊断 · 监控大盘'", "label: '监控大盘'");
oms=oms.replace('统一平台整合样板','网络故障诊断子系统').replace('本地开发副本','LLM_NetworkDiag · Console').replace('云边端协同<span>智能决策平台</span>','OMS<span>运维监控</span>');
oms=oms.replace('<div class="sidebar-footer">','<div class="sidebar-footer">\n <RouterLink to="/platform" class="navigation-item">返回首页</RouterLink>');
await fs.writeFile('src/OmsLayout.vue',oms);
await fs.writeFile('src/App.vue',`<script setup lang="ts">
import { computed, watch, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import OmsLayout from './OmsLayout.vue'
import omsStyles from './assets/theme.css?url'
import homeTokens from './home/styles/tokens.css?url'
import homeStyles from './home/styles/main.css?url'
const route = useRoute()
const isHome = computed(() => route.path === '/platform')
const previousDark = document.documentElement.classList.contains('dark')
watch(isHome, home => {
 document.documentElement.classList.toggle('dark', home && localStorage.getItem('snowapi-portal-theme') === 'dark')
}, { immediate: true })
onUnmounted(() => document.documentElement.classList.toggle('dark', previousDark))
</script>
<template>
 <template v-if="isHome"><component :is="'link'" rel="stylesheet" :href="homeTokens" /><component :is="'link'" rel="stylesheet" :href="homeStyles" /><RouterView /></template>
 <template v-else><component :is="'link'" rel="stylesheet" :href="omsStyles" /><OmsLayout /></template>
</template>
`);
let main=await fs.readFile('src/main.ts','utf8');main=main.replace("import './assets/theme.css'", "import '@fontsource-variable/public-sans'\nimport { i18n } from './home/lib/i18n'");main=main.replace('createApp(App).use(createPinia())','createApp(App).use(i18n).use(createPinia())');await fs.writeFile('src/main.ts',main);
let routes=await fs.readFile('src/router/index.ts','utf8');routes=routes.replace("import('../views/PlatformView.vue'), meta: { title: '平台概览' }", "import('../home/HomePage.vue'), meta: { title: '首页' }");await fs.writeFile('src/router/index.ts',routes);
