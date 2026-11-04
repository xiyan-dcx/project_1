import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'

const appRoot = fileURLToPath(new URL('../', import.meta.url))
const require = createRequire(import.meta.url)
const contract = JSON.parse(await readFile(
  new URL('../../../packages/config/portal_contract.json', import.meta.url), 'utf8',
))

// The handoff artifact must use the agreed paths even if the developer's shell
// still carries environment overrides from a standalone deployment.
process.env.VITE_BASE_PATH = contract.pageBasePath
process.env.VITE_ENGINE_API_BASE = contract.apiBasePath

const check = spawnSync(process.execPath, [require.resolve('vue-tsc/bin/vue-tsc.js'), '--noEmit'], {
  cwd: appRoot,
  stdio: 'inherit',
})
if (check.error) throw check.error
if (check.status !== 0) process.exit(check.status ?? 1)

await build({ root: appRoot, mode: 'portal', build: { outDir: 'dist-portal' } })
