import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  base: '/oms/',
  plugins: [vue()],
  server: {
    host: '127.0.0.1',
    proxy: {
      '/api': 'http://10.166.33.36:3000',
      '/experiments/output': 'http://10.166.33.36:3000',
    },
  },
})
