// 校验模板里用到的 Tailwind 类名是否都出现在构建产物中。
//
// 加了 sd- 前缀之后，漏写前缀或拼错类名不会报错，样式只是静默失效，
// 人工很难发现。这个脚本把「模板用到的类名」和「CSS 里生成的类名」对一遍。
//
// 用法：先构建，再 pnpm check:classes；同时检查门户：pnpm check:classes dist dist-portal
import { readdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const srcDir = join(appRoot, 'src')
const outputDirs = process.argv.slice(2)
const buildDirs = outputDirs.length ? outputDirs : ['dist']

/** 只用来识别「看起来像工具类但漏了前缀」的 token，不参与是否存在的判断。 */
const UTILITY_HINTS = [
  'flex', 'grid', 'block', 'inline', 'hidden', 'absolute', 'relative', 'fixed', 'sticky',
  'truncate', 'transition', 'backdrop', 'overflow', 'space-', 'place-', 'pointer-events-',
  'text-', 'bg-', 'border', 'rounded', 'shadow', 'font-', 'leading-', 'tracking-',
  'p-', 'px-', 'py-', 'pt-', 'pb-', 'pl-', 'pr-', 'm-', 'mx-', 'my-', 'mt-', 'mb-', 'ml-', 'mr-',
  'h-', 'w-', 'min-h-', 'min-w-', 'max-h-', 'max-w-', 'gap-', 'space', 'items-', 'justify-',
  'self-', 'z-', 'opacity-', 'whitespace-', 'shrink-', 'grow-', 'basis-', 'col-', 'row-',
  'from-', 'to-', 'via-', 'order-', 'cursor-', 'select-', 'aspect-', 'animate-',
]
const VARIANT_PREFIXES = ['hover:', 'focus:', 'focus-visible:', 'group-hover:', 'enabled:', 'disabled:', 'motion-reduce:', 'motion-safe:']
const BREAKPOINTS = ['sm:', 'md:', 'lg:', 'xl:', '2xl:']
/** 只作为变体标记使用，本身不会生成独立选择器。 */
const MARKER_CLASSES = new Set(['sd-group'])

async function collectFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) files.push(...(await collectFiles(full)))
    else if (entry.name.endsWith('.vue')) files.push(full)
  }

  return files
}

/** class="..." 与 :class="..." 里的字符串字面量。 */
function extractClassTokens(source) {
  const tokens = []
  const attributePattern = /(?::class|class|body-class)="([^"]*)"/g
  let match

  while ((match = attributePattern.exec(source)) !== null) {
    const value = match[1]
    const literals = value.match(/'[^']*'|"[^"]*"/g)
    const parts = literals ?? [value]

    for (const part of parts) {
      for (const token of part.replace(/^['"]|['"]$/g, '').split(/\s+/)) {
        if (token) tokens.push(token)
      }
    }
  }

  return tokens
}

function stripVariants(token) {
  let rest = token
  let changed = true

  while (changed) {
    changed = false
    for (const prefix of [...VARIANT_PREFIXES, ...BREAKPOINTS]) {
      if (rest.startsWith(prefix)) {
        rest = rest.slice(prefix.length)
        changed = true
      }
    }
  }

  return rest
}

/**
 * CSS 选择器里对类名特殊字符的转义。
 * 以数字开头的类名（例如 2xl:）在 CSS 里会被写成 \32 xl\:，必须按十六进制转义处理。
 */
function escapeSelector(token) {
  const escaped = token.replace(/[.:/[\]()%#,+*~>'"]/g, (char) => `\\${char}`)
  const leadingDigit = escaped.match(/^(\d)/)

  if (!leadingDigit) return escaped

  const hex = leadingDigit[1].charCodeAt(0).toString(16)
  // 十六进制转义后面紧跟的若不是十六进制字符，空格可以省略；Tailwind 就省略了。
  return `\\${hex}${escaped.slice(1)}`
}

const stylesByBuild = new Map()
for (const build of buildDirs) {
  const assetsDir = join(appRoot, build, 'assets')
  const cssFiles = (await readdir(assetsDir)).filter((name) => name.endsWith('.css'))
  if (cssFiles.length === 0) throw new Error(`${build}/assets 下没有 CSS，请先构建`)
  stylesByBuild.set(build, (await Promise.all(cssFiles.map((name) => readFile(join(assetsDir, name), 'utf8')))).join('\n'))
}
const files = await collectFiles(srcDir)

const missing = new Map()
const unprefixed = new Map()

for (const file of files) {
  const source = await readFile(file, 'utf8')
  const relative = file.slice(appRoot.length + 1)

  for (const token of extractClassTokens(source)) {
    const base = stripVariants(token)
    if (MARKER_CLASSES.has(base)) continue

    if (!base.startsWith('sd-')) {
      const looksLikeUtility = UTILITY_HINTS.some((hint) => base.startsWith(hint))
      if (looksLikeUtility) {
        if (!unprefixed.has(token)) unprefixed.set(token, [])
        unprefixed.get(token).push(relative)
      }
      continue
    }

    for (const [build, css] of stylesByBuild) {
      if (!css.includes(`.${escapeSelector(token)}`)) {
        const key = `${build}: ${token}`
        if (!missing.has(key)) missing.set(key, [])
        missing.get(key).push(relative)
      }
    }
  }
}

function report(title, entries, hint) {
  if (entries.size === 0) return 0

  console.error(`\n${title}`)
  for (const [token, where] of [...entries].sort()) {
    console.error(`  ${token}  ←  ${[...new Set(where)].join(', ')}`)
  }
  console.error(hint)
  return entries.size
}

const missingCount = report('以下类名在 CSS 里不存在（拼写错误或工具类未生成）：', missing, '检查写法，或确认它确实会被 Tailwind 生成。')
const unprefixedCount = report('以下类名看起来是工具类但缺少 sd- 前缀：', unprefixed, '补上前缀，否则样式不会生效。')

if (missingCount + unprefixedCount > 0) process.exit(1)

console.log(`类名检查通过：扫描 ${files.length} 个 .vue 文件和 ${buildDirs.join("、")}，未发现缺失或漏前缀的类名。`)
