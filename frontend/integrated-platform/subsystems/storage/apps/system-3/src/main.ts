import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import '@research-platform/design-system/styles'
import './assets/styles.css'
import { initializeTheme } from '@research-platform/design-system/theme'
initializeTheme()

createApp(App).use(router).mount('#app')
