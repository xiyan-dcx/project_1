<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { Activity, LayoutDashboard, ListFilter, Menu, Moon, Settings2, Sun, X } from 'lucide-vue-next'
import { useTasksStore } from './stores/tasks'
import BrandMark from './components/BrandMark.vue'
import TaskProgress from './components/TaskProgress.vue'

const route = useRoute()
const navigationOpen = ref(false)
const tasks = useTasksStore()
const dark = ref(document.documentElement.classList.contains('dark'))
function toggleTheme() {
  dark.value = !dark.value
  document.documentElement.classList.toggle('dark', dark.value)
  document.documentElement.style.colorScheme = dark.value ? 'dark' : 'light'
  localStorage.setItem('snowapi-portal-theme', dark.value ? 'dark' : 'light')
}

const navigation = [
  { path: '/overview', label: '监控大盘', subtitle: '集群运行风险与重点故障值班通报', icon: LayoutDashboard },
  { path: '/diagnosis', label: '诊断分析', subtitle: '多阶段根因推理、传播链路与拓扑证据', icon: Activity },
  { path: '/events', label: '事件管理', subtitle: '原始日志扫描、批量诊断与产物归档', icon: ListFilter },
  { path: '/settings', label: '系统设置', subtitle: '推理模型服务切换与连接凭据管理', icon: Settings2 },
]


const currentSubtitle = computed(() => {
  const matched = navigation.find((item) => route.path.startsWith(item.path))
  return matched?.subtitle ?? ''
})

watch(() => route.fullPath, () => { navigationOpen.value = false })
onMounted(() => { void tasks.restoreRunningTask() })
</script>

<template>
  <a class="skip-link" href="#main-content">跳到主要内容</a>
  <div class="application-shell">
    <aside class="sidebar" data-slot="sidebar" :class="{ 'is-open': navigationOpen }">
      <div class="sidebar-brand-row">
        <RouterLink class="brand" to="/overview" aria-label="OMS 运维监控首页">
          <span class="brand-mark" aria-hidden="true"><BrandMark /></span>
          <span class="brand-text">OMS<span>运维监控</span></span>
        </RouterLink>
      </div>
      <div class="sidebar-section-label" aria-hidden="true">控制台导航</div>
      <nav aria-label="主要导航">
        <RouterLink
          v-for="item in navigation"
          :key="item.path"
          :to="item.path"
          data-slot="sidebar-item"
          class="navigation-item"
          :class="{ 'is-selected': route.path.startsWith(item.path) }"
          :data-active="route.path.startsWith(item.path) ? 'true' : undefined"
        >
          <component :is="item.icon" :size="16" :stroke-width="1.75" aria-hidden="true" />
          <span>{{ item.label }}</span>
        </RouterLink>
      </nav>
      <div class="sidebar-footer">
 <a href="/platform" class="navigation-item">返回首页</a>
        <div class="sidebar-caption">网络故障诊断子系统</div>
        <div class="sidebar-subcaption">LLM_NetworkDiag · Console</div>
      </div>
    </aside>

    <div class="workspace" data-slot="sidebar-inset">
      <header class="page-header" data-slot="app-header">
        <button
          type="button"
          class="mobile-menu icon-button"
          :aria-expanded="navigationOpen"
          aria-label="切换导航"
          @click="navigationOpen = !navigationOpen"
        >
          <X v-if="navigationOpen" :size="18" aria-hidden="true" />
          <Menu v-else :size="18" aria-hidden="true" />
        </button>
        <h1>{{ route.meta.title }}</h1>
        <template v-if="currentSubtitle">
          <span class="header-divider" aria-hidden="true" />
          <span class="header-subtitle">{{ currentSubtitle }}</span>
        </template>
        <button
          v-if="tasks.task && !tasks.visible"
          type="button"
          data-slot="button"
          data-variant="outline"
          data-size="sm"
          class="task-entry"
          @click="tasks.visible = true"
        >
          {{ tasks.running ? '查看运行任务' : '查看最近任务' }}
        </button>
        <span class="portal-system-badge">System 01</span>
        <button type="button" data-portal-theme :aria-label="dark ? '切换为浅色模式' : '切换为深色模式'" @click="toggleTheme">
          <component :is="dark ? Sun : Moon" aria-hidden="true" />
          <span>{{ dark ? '浅色' : '深色' }}</span>
        </button>
      </header>
      <main id="main-content" tabindex="-1">
        <TaskProgress />
        <RouterView />
      </main>
    </div>
  </div>
</template>

