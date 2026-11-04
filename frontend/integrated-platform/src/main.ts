import { createApp } from 'vue'
import { i18n } from './home/lib/i18n'
import HomePage from './home/HomePage.vue'
import './home/styles/tokens.css'
import './home/styles/main.css'

document.documentElement.classList.toggle('dark', localStorage.getItem('snowapi-portal-theme') === 'dark')
createApp(HomePage).use(i18n).mount('#app')
