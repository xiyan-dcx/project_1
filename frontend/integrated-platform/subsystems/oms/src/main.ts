import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import 'element-plus/dist/index.css'
import '@fontsource-variable/public-sans'
import { router } from './router'

import OmsLayout from './OmsLayout.vue'
import './assets/theme.css'
import './assets/portal-shell.css'

document.documentElement.classList.toggle('dark', localStorage.getItem('snowapi-portal-theme') === 'dark')
createApp(OmsLayout).use(createPinia()).use(router).use(ElementPlus, { locale: zhCn }).mount('#app')
