import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import test from 'node:test'
import ts from 'typescript'

const source = readFileSync(new URL('../src/domain/dashboard.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText
const exports = {}
vm.runInNewContext(compiled, { exports, require: () => { throw new Error('Unexpected runtime dependency') } })
const { benchmarkAllowed, parseEngineCatalog, color } = exports

test('benchmark remains disabled when production health omits run_enabled', () => {
  assert.equal(benchmarkAllowed({ ok: true, state: 'idle', engine_mode: 'unknown' }), false)
})

test('only explicit boolean opt-in enables benchmark submission', () => {
  assert.equal(benchmarkAllowed({ ok: true, run_enabled: true }), true)
  assert.equal(benchmarkAllowed({ ok: true, run_enabled: false }), false)
  assert.equal(benchmarkAllowed({ ok: true, run_enabled: 'true' }), false)
  assert.equal(benchmarkAllowed({ ok: false, run_enabled: true }), false)
})

test('engine catalog validates backend capabilities and includes dynamic engine colors', () => {
  const engines = parseEngineCatalog({ engines: [
    { key: 'scalaafa', name: 'ScalaAFA', mode: 'spdk', runnable: true, reason: '' },
    { key: 'dpp', name: 'ScalaAFA-dPP', mode: 'spdk', runnable: true, reason: '' },
    { key: 'mdraid', name: 'mdraid', mode: 'kernel', runnable: false, reason: 'runner disabled' },
  ] })
  assert.deepEqual(engines.map(engine => engine.key), ['scalaafa', 'dpp', 'mdraid'])
  assert.equal(color('dpp'), '#7b2ff7')
  assert.throws(() => parseEngineCatalog({ engines: [{ key: 'dpp', name: 'dPP', mode: 'spdk' }] }), /字段缺失/)
})
