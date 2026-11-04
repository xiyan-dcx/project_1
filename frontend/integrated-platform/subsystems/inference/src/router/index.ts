import { createRouter, createWebHistory } from 'vue-router'
import InferenceView from '@/views/InferenceView.vue'

export default createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'inference', component: InferenceView },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})
