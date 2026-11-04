import { createRouter, createWebHistory } from 'vue-router'
import SchedulerDisplay from '@/views/SchedulerDisplay.vue'

/**
 * Only used when the page runs standalone. When the portal mounts
 * SchedulerDisplay.vue directly, its own router owns the route.
 */
export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'scheduler-display',
      component: SchedulerDisplay,
    },
  ],
})
