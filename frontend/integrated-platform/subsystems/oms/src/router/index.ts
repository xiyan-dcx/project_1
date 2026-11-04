import { createRouter, createWebHistory } from 'vue-router'

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', redirect: '/overview' },
    { path: '/overview', name: 'overview', component: () => import('../views/OverviewView.vue'), meta: { title: '监控大盘' } },
    { path: '/diagnosis/:recordId?', name: 'diagnosis', component: () => import('../views/DiagnosisView.vue'), meta: { title: '诊断分析' } },
    { path: '/events', name: 'events', component: () => import('../views/EventsView.vue'), meta: { title: '事件管理' } },
    { path: '/settings', name: 'settings', component: () => import('../views/SettingsView.vue'), meta: { title: '系统设置' } },
    { path: '/:pathMatch(.*)*', component: () => import('../views/NotFoundView.vue'), meta: { title: '页面不存在' } },
  ],
  scrollBehavior: () => ({ top: 0 }),
})

router.afterEach((route) => { document.title = `${String(route.meta.title ?? '运维监控')} · OMS` })

