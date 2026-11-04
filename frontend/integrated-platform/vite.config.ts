import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
function mountOms(server: { middlewares: import('vite').ViteDevServer['middlewares'] }, directory: string) {
  server.middlewares.use((req, res, next) => {
    const path = req.url?.split('?')[0]
    if (path === '/oms') {
      res.writeHead(302, { Location: '/oms/' })
      res.end()
      return
    }
    if (!path?.startsWith('/oms/') || path.slice('/oms/'.length).includes('.')) return next()
    try {
      const html = readFileSync(new URL(`./${directory}/oms/index.html`, import.meta.url))
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.end(html)
    } catch (error) {
      next(error)
    }
  })
}

export default defineConfig({
  plugins: [vue(), {
    name: 'scheduler-portal-entry',
    configurePreviewServer: server => mountOms(server, server.config.build.outDir),
    configureServer(server) {
      mountOms(server, 'public')

      server.middlewares.use((req, res, next) => {
        const path = req.url?.split('?')[0]
        if (path === '/system-3') { res.writeHead(302, { Location: '/system-3/' }); res.end(); return }
        if (path?.startsWith('/system-3/') && !path.startsWith('/system-3/api') && !path.startsWith('/system-3/ws') && !path.startsWith('/system-3/assets/')) {
          res.setHeader('Content-Type', 'text/html; charset=utf-8')
          res.end(readFileSync(fileURLToPath(new URL('./public/system-3/index.html', import.meta.url))))
          return
        }
        if (path === '/inference') { res.writeHead(302, { Location: '/inference/' }); res.end(); return }
        if (path === '/inference/' || path === '/inference/index.html') {
          res.setHeader('Content-Type', 'text/html; charset=utf-8')
          res.end(readFileSync(fileURLToPath(new URL('./public/inference/index.html', import.meta.url))))
          return
        }
        if (path === '/scheduler') { res.writeHead(302, { Location: '/scheduler/' }); res.end(); return }
        if (path === '/scheduler/' || path === '/scheduler/index.html') {
          res.setHeader('Content-Type', 'text/html; charset=utf-8')
          res.end(readFileSync(fileURLToPath(new URL('./public/scheduler/index.html', import.meta.url))))
          return
        }
        next()
      })
    },
  }],
  server: {
    host: '127.0.0.1', port: 5180, strictPort: true,
    proxy: {
      '/system-3/api': { target: 'http://10.166.33.36:5174', changeOrigin: true },
      '/system-3/ws': { target: 'ws://10.166.33.36:5174', changeOrigin: true, ws: true },
      '/inference/api': {
        target: 'http://10.166.33.36:8083', changeOrigin: true,
        rewrite: path => path.replace(/^\/inference/, ''),
        timeout: 0, proxyTimeout: 0,
      },
      '/scheduler/api/k8s': {
        target: 'http://10.166.33.36:5173', changeOrigin: true,
        rewrite: path => path.replace(/^\/scheduler/, ''),
        timeout: 0, proxyTimeout: 0,
      },
      '/api': { target: 'http://10.166.33.36:3000', changeOrigin: true },
      '/experiments/output': { target: 'http://10.166.33.36:3000', changeOrigin: true },
    },
  },
})
