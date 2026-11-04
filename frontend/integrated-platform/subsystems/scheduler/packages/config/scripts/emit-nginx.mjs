// 从 system_config.ts 生成 nginx upstream 片段，保证 IP 只维护一处。
//
// 这里用正则读取而不是 import：system_config.ts 是 TypeScript，直接 import 需要
// 运行时支持类型擦除（Node 22.18+），而部署机上的 Node 版本不保证一致。
// 读取失败会直接报错退出，不会静默生成错误的配置。
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const configPath = join(here, '..', 'system_config.ts')
const outPath = join(here, '..', '..', '..', 'deploy', 'nginx', 'http', 'engine.upstream.conf')

function readConst(source, name) {
  // 只接受字符串字面量或纯数字，避免把表达式误当成常量值。
  const match = source.match(new RegExp(`export const ${name}\\s*=\\s*(?:'([^']*)'|(\\d+))`))

  if (!match) {
    throw new Error(`system_config.ts 里找不到 ${name}，请确认它是单引号字符串或纯数字字面量`)
  }

  return match[1] ?? match[2]
}

const source = await readFile(configPath, 'utf8')
const target = readConst(source, 'ENGINE_TARGET')
const port = readConst(source, 'ENGINE_PORT')

const content = `# 由 packages/config/scripts/emit-nginx.mjs 生成，请勿手工编辑。
# 重新生成：pnpm nginx:upstream
upstream scheduler_engine {
    server ${target}:${port};
}
`

await mkdir(dirname(outPath), { recursive: true })
await writeFile(outPath, content, 'utf8')
console.log(`已生成 ${outPath}`)
console.log(`  upstream scheduler_engine -> ${target}:${port}`)
