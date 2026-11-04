import { readFileSync, writeFileSync, copyFileSync } from 'node:fs'
import { resolve } from 'node:path'
const root = resolve(import.meta.dirname, '..')
const entries = ['scheduler', 'inference', 'system-3']
for (const name of entries) {
  const file = resolve(root, 'public', name, 'index.html')
  let html = readFileSync(file, 'utf8')
  html = html.replace(/\s*<link[^>]*href="\/portal-shell.css"[^>]*>/g, '').replace(/\s*<script[^>]*src="\/portal-shell.js"[^>]*><\/script>/g, '')
  html = html.replace('</head>', '<link rel="stylesheet" href="/portal-shell.css">\n</head>')
    .replace('</body>', '<script defer src="/portal-shell.js"></script>\n</body>')
  writeFileSync(file, html)
}
console.log('Shared portal shell applied to three standalone entries.')
