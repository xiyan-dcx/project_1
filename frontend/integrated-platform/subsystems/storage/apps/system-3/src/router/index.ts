import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      redirect: (to) => ({ path: typeof to.query.job === 'string' && to.query.job.startsWith('compare-') ? '/diagnostics/compaction' : '/benchmark', query: to.query, hash: to.hash }),
    },
    {
      path: '/comparison',
      redirect: (to) => ({ path: typeof to.query.job === 'string' && to.query.job.startsWith('compare-') ? '/diagnostics/compaction' : '/benchmark', query: to.query, hash: to.hash }),
    },
    {
      path: '/benchmark',
      component: () => import('../views/FullStackView.vue'),
    },
    {
      path: '/diagnostics/compaction',
      component: () => import('../views/ComparisonView.vue'),
    },
    {
      path: '/diagnostics/engines',
      component: () => import('../views/BenchmarkView.vue'),
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: (to) => ({ path: '/comparison', query: to.query, hash: to.hash }),
    },
  ],
})

export default router
