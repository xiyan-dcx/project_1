import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const apiTarget = process.env.SYSTEM3_API_TARGET || 'http://127.0.0.1:8000'

export default defineConfig({
  plugins: [vue()],
  base: '/system-3/',
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/echarts/')) return 'echarts'
          if (id.includes('/node_modules/zrender/')) return 'zrender'
        },
      },
    },
  },
  resolve: {
    alias: { '@': '/src' },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/system-3/api': {
        target: apiTarget,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/system-3/, ''),
      },
      '/system-3/ws': {
        target: apiTarget.replace(/^http/, 'ws'),
        ws: true,
        rewrite: (path) => path.replace(/^\/system-3/, ''),
      },
    },
  },
})
