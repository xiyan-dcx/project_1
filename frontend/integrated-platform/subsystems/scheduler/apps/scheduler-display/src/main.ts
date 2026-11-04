import { createApp } from 'vue'
import '@research/styles/theme.css'
import './styles/index.css'
import './styles/standalone.css'
import App from './App.vue'
import { router } from './router'

createApp(App).use(router).mount('#app')
