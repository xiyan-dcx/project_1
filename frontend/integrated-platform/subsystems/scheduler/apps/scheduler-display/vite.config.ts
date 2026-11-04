import { fileURLToPath, URL } from 'node:url'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import {
  ENGINE_API_PATH,
  ENGINE_PORT,
  ENGINE_TARGET,
  SCHEDULER_DISPLAY_BASE_PATH,
} from '@research/config/system_config'

export default defineConfig(({ mode }) => ({
  /**
   * 独立部署时默认挂在门户的 /scheduler/ 下；作为组件嵌入时 base 不参与。
   * 本地 launchd 静态服务器把页面直接挂在根路径，用 VITE_BASE_PATH=/ 覆盖。
   */
  base: process.env.VITE_BASE_PATH ?? (mode === 'production' ? SCHEDULER_DISPLAY_BASE_PATH : '/'),
  plugins: [vue(), {
    name: 'public-sans-license',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'assets/PublicSans-OFL.txt',
        source: readFileSync(new URL('../../packages/styles/fonts/OFL.txt', import.meta.url), 'utf8'),
      })
    },
  }],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    // 与当前演示服务使用的 5173 端口错开。
    port: 5174,
    proxy: {
      // 开发时把接口转发到引擎，IP 来自 packages/config，不在本文件写死。
      [ENGINE_API_PATH]: {
        target: `http://${ENGINE_TARGET}:${ENGINE_PORT}`,
        changeOrigin: true,
        timeout: 0,
        proxyTimeout: 0,
      },
    },
  },
}))
