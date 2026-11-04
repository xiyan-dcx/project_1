// Local visual review: serve both builds and proxy the scheduler API locally.
import http from 'node:http'
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const appRoot = fileURLToPath(new URL('../', import.meta.url))
const contract = JSON.parse(readFileSync(new URL('../../../packages/config/portal_contract.json', import.meta.url), 'utf8'))
const port = Number(process.env.SD_PREVIEW_PORT ?? 5174)
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('SD_PREVIEW_PORT 必须是有效端口')
for (const folder of ['dist', 'dist-portal']) {
  if (!existsSync(path.join(appRoot, folder, 'index.html'))) throw new Error(`请先构建 ${folder}`)
}
const mime = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.ttf': 'font/ttf', '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
}

function proxy(req, res, prefix) {
  if (!['GET', 'POST'].includes(req.method ?? '')) {
    res.writeHead(405, { Allow: 'GET, POST', 'Content-Type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ error: '本地预览仅支持读取、创建测试 Pod 和删除测试 Pod 请求。' }))
    return
  }
  const target = new URL(`${contract.backendApiPath}/${req.url.slice(prefix.length)}`, contract.backendOrigin)
  const headers = { accept: req.headers.accept ?? '*/*' }
  if (req.method === 'POST') {
    headers['content-type'] = req.headers['content-type'] ?? 'application/json'
    if (req.headers['content-length']) headers['content-length'] = req.headers['content-length']
  }
  const upstream = http.request(target, { method: req.method, headers }, response => {
    res.writeHead(response.statusCode ?? 502, { ...response.headers, 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' })
    response.pipe(res)
  })
  upstream.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end() })
  req.pipe(upstream)
  res.on('close', () => upstream.destroy())
}

function serve(req, res, folder, prefix, pathname) {
  let route
  try { route = decodeURIComponent(pathname).slice(prefix.length) } catch { res.writeHead(400).end(); return }
  if (!route || route.endsWith('/')) route += 'index.html'
  let file = path.resolve(folder, route)
  if (!file.startsWith(path.resolve(folder) + path.sep)) { res.writeHead(403).end(); return }
  if (!existsSync(file)) {
    if (path.extname(file)) { res.writeHead(404).end(); return }
    file = path.join(folder, 'index.html')
  }
  if (!statSync(file).isFile()) { res.writeHead(404).end(); return }
  res.writeHead(200, { 'Content-Type': mime[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' })
  createReadStream(file).pipe(res)
}

http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname
  const base = contract.pageBasePath
  if (pathname === base.slice(0, -1)) { res.writeHead(301, { Location: base }).end(); return }
  for (const prefix of [`${contract.apiBasePath}/`, `${contract.backendApiPath}/`]) {
    if (pathname.startsWith(prefix)) { proxy(req, res, prefix); return }
  }
  const portal = pathname.startsWith(base)
  serve(req, res, path.join(appRoot, portal ? 'dist-portal' : 'dist'), portal ? base : '/', pathname)
}).listen(port, '127.0.0.1', () => {
  console.log(`独立预览 http://127.0.0.1:${port}/`)
  console.log(`门户预览 http://127.0.0.1:${port}${contract.pageBasePath}`)
  console.log('读取真实集群数据；创建和删除请求会转发到配置的后端。此进程只监听本机。')
})
