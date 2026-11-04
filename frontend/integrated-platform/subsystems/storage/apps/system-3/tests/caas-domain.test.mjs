import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import test from 'node:test'
import ts from 'typescript'

// Transpile the pure TypeScript domain module so this test also runs on Node 20.
const source = readFileSync(new URL('../src/domain/caas.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText
const exports = {}
vm.runInNewContext(compiled, { exports, require: () => { throw new Error('Unexpected runtime dependency') } })
const { acceptanceChecks, isScalaAfaBackend } = exports

test('online dPP addition does not trigger false ScalaAFA isolation warning', () => {
  assert.equal(isScalaAfaBackend({ ok: true, storage_backend: 'ScalaAFA afa0 + online dPP via NVMe-oF local PV' }), true)
  assert.equal(isScalaAfaBackend({ ok: true, storage_backend: 'host-local ext4' }), false)
})

test('accepted 100k comparison has all five checks passing', () => {
  const comparison = {
    local: { ops_per_sec_cv_percent: 4.5154 },
    caas: { ops_per_sec_cv_percent: 17.4931, remote_compactions: 6 },
  }
  const acceptance = {
    formal_run: true, throughput_improved: true, stable: true,
    remote_path_exercised: true, dpp_online_verified: true,
    minimum_repeats: 3, max_cv_percent: 20, passed: true,
  }
  assert.equal(acceptanceChecks(acceptance, comparison).every(item => item.ok), true)
})

test('20k result explicitly identifies unstable baseline and unused remote path', () => {
  const comparison = {
    local: { ops_per_sec_cv_percent: 24.5033 },
    caas: { ops_per_sec_cv_percent: 7.2137, remote_compactions: 0 },
  }
  const acceptance = {
    formal_run: true, throughput_improved: true, stable: false,
    remote_path_exercised: false, dpp_online_verified: true,
    minimum_repeats: 3, max_cv_percent: 20, passed: false,
  }
  const failed = acceptanceChecks(acceptance, comparison).filter(item => !item.ok)
  assert.equal(failed.length, 2)
  assert.match(failed[0].label, /24\.5%/)
  assert.match(failed[1].label, /0 次/)
})
