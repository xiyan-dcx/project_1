import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { requestJson, requestText } from './client'
import {
  buildTopologyMermaid, fetchDiagnosis, fetchDiagnosisReport, fetchHostAnalysis, fetchSchedulingAdvice,
  normalizeDiagnosis, normalizeDeviceAnalysis, normalizeEvidence, normalizeTopology, getTopologyAnnotations,
} from './diagnosis'
import type { EventRecord } from './types'

vi.mock('./client', () => ({ requestJson: vi.fn(), requestText: vi.fn() }))

function createRecord(): EventRecord {
  return {
    record_id: 'diagnosis-record', event_id: 'event', source: 'real', suite: null, run_id: null,
    generated_at: '', occurred_at: '', occurred_at_estimated: true,
    primary_failed_host: '', root_cause_category: '', confidence: '',
    overall_severity: '', summary: '', diagnosis_url: '/api/resources/diagnosis',
    report_url: '/api/resources/report', hosts: [], impacted_hosts: [],
    status: 'open', status_updated_at: null, resolved_at: null,
    capabilities: { delete: false, diagnose: false, scheduling: true, status: true },
  }
}

describe('diagnosis normalization', () => {
  it('preserves structured and string evidence without converting objects to opaque text', () => {
    const structuredEvidence = { host: '10.0.3.12', line: 42, excerpt: '<script>untrusted</script>' }
    expect(normalizeEvidence(['log.jsonl#42', structuredEvidence, null])).toEqual([
      'log.jsonl#42', JSON.stringify(structuredEvidence, null, 2),
    ])
    expect(normalizeEvidence(structuredEvidence)).toEqual([JSON.stringify(structuredEvidence, null, 2)])
    expect(normalizeEvidence(undefined)).toEqual([])
  })

  it('reads actual nested LLM output and embedded host analyses', () => {
    const diagnosis = normalizeDiagnosis({
      llm: {
        model: 'deepseek-chat', usage: { total_tokens: 0 },
        llm_output: {
          event_diagnosis: {
            executive_summary: 'summary',
            final_diagnosis: { statement: 'statement', confidence: 'high' },
            fault_propagation: [{ stage: 'initial', evidence_refs: [{ line: 12 }] }],
          },
        },
      },
      host_analyses: [{ host_ip: '10.0.3.12', device_analysis: { device_summary: 'host summary' } }],
      input_context: { topology: {} },
    })
    expect(diagnosis.summary).toBe('summary')
    expect(diagnosis.confidence).toBe('high')
    expect(diagnosis.hosts[0]?.analysis?.summary).toBe('host summary')
    expect(diagnosis.usage.total_tokens).toBe(0)
    expect(diagnosis.propagation[0]?.evidence).toEqual(['{\n  "line": 12\n}'])
    expect(diagnosis.topology.edges).toEqual([])
  })

  it('tolerates absent and malformed arrays without inventing healthy hosts', () => {
    const diagnosis = normalizeDiagnosis({
      host_analyses: null,
      llm: { llm_output: { event_diagnosis: { fault_propagation: {}, suspected_root_causes: 'invalid' } } },
    })
    expect(diagnosis.hosts).toEqual([])
    expect(diagnosis.topology.hosts).toEqual([])
    expect(diagnosis.propagation).toEqual([])
    expect(diagnosis.causes).toEqual([])
    expect(diagnosis.severity).toBe('')
    expect(() => normalizeDiagnosis(null)).toThrow()
  })

  it('extracts host resource wrappers and retains their token usage', () => {
    const analysis = normalizeDeviceAnalysis({
      llm: {
        usage: { total_tokens: 1629 },
        llm_output: { device_analysis: { overall_risk: 'high', device_summary: 'disk failure', service_assessments: null } },
      },
    })
    expect(analysis?.risk).toBe('high')
    expect(analysis?.services).toEqual([])
    expect(analysis?.usage.total_tokens).toBe(1629)
    expect(normalizeDeviceAnalysis({ error: 'missing' })).toBeNull()
  })

  it('merges only catalog-associated host URLs rather than guessing filesystem paths', () => {
    const record = createRecord()
    record.hosts = [{ host_ip: '10.0.3.12', analysis_url: '/api/resources/host' }]
    const diagnosis = normalizeDiagnosis({
      host_analyses: [{ host_ip: '10.0.3.12', analysis_file: 'local/path.json' }, { host_ip: 'unknown_host' }],
    }, record)
    expect(diagnosis.hosts.map((host) => host.analysisUrl)).toEqual(['/api/resources/host', null])
  })
})

describe('truthful topology generation', () => {
  it('includes an explicitly diagnosed primary host without manufacturing analysis or edges', () => {
    const diagnosis = normalizeDiagnosis({ event_diagnosis: { primary_failed_host: 'fault-host' } })
    expect(diagnosis.topology.hosts).toEqual(['fault-host'])
    expect(diagnosis.topology.edges).toEqual([])
    expect(diagnosis.hosts[0]?.analysis).toBeNull()
    const graph = buildTopologyMermaid(diagnosis.topology, diagnosis.primaryHost, diagnosis.causes)
    expect(graph).toContain('首要故障')
    expect(graph).toContain(':::primary')
    expect(graph).not.toContain('推断关联 .->')
    const record = createRecord()
    record.primary_failed_host = '未知'
    expect(normalizeDiagnosis({}, record).topology.hosts).toEqual([])
  })

  it('separates solid input connections from deduplicated, explicitly supported inferred associations', () => {
    const diagnosis = normalizeDiagnosis({
      input_context: { topology: { hosts: ['primary', 'impacted', 'unrelated'], edges: [['primary', 'impacted']] } },
      event_diagnosis: {
        primary_failed_host: 'primary',
        suspected_root_causes: [
          { impacted_hosts: ['primary', 'impacted', 'not-in-topology'] },
          { impacted_hosts: ['impacted'] },
        ],
      },
    })
    const annotations = getTopologyAnnotations(diagnosis.topology, diagnosis.primaryHost, diagnosis.causes)
    expect(annotations.impactedHosts).toEqual(['impacted'])
    expect(annotations.inferredRelationships).toEqual([{ source: 'primary', target: 'impacted' }])
    const graph = buildTopologyMermaid(diagnosis.topology, diagnosis.primaryHost, diagnosis.causes)
    expect(graph).toContain('host_0 --- host_1')
    expect(graph).toContain('host_0 -. 推断关联 .-> host_1')
    expect(graph).toContain(':::impacted')
    expect(graph).not.toContain('.-> host_2')
    expect(graph).not.toContain('not-in-topology')
    expect(diagnosis.topology.edges).toHaveLength(1)
    expect(getTopologyAnnotations(diagnosis.topology, '', diagnosis.causes).inferredRelationships).toEqual([])
    expect(getTopologyAnnotations(diagnosis.topology, 'absent', diagnosis.causes).inferredRelationships).toEqual([])
    expect(getTopologyAnnotations(diagnosis.topology, 'primary', []).inferredRelationships).toEqual([])
  })

  it('never turns inferred propagation or shared impact into physical edges', () => {
    const diagnosis = normalizeDiagnosis({
      host_analyses: [{ host_ip: '10.0.3.12' }, { host_ip: '10.0.3.13' }, { host_ip: '10.0.3.14' }],
      input_context: { topology: {} },
      llm: { llm_output: { event_diagnosis: {
        primary_failed_host: '10.0.3.12',
        suspected_root_causes: [{ impacted_hosts: ['10.0.3.13', '10.0.3.14', 'invented-host'] }],
        fault_propagation: [{ description: '10.0.3.12 affects every host' }],
      } } },
    })
    expect(diagnosis.topology.hosts).toHaveLength(3)
    expect(diagnosis.topology.hosts).not.toContain('invented-host')
    expect(diagnosis.topology.edges).toEqual([])
    expect(buildTopologyMermaid(diagnosis.topology)).not.toMatch(/ --> | --- /)
  })

  it('preserves actual star topology and rejects incomplete edges', () => {
    const topology = normalizeTopology({
      hosts: ['10.0.3.12', '10.0.3.13', '10.0.3.14'],
      edges: [['10.0.3.13', '10.0.3.12'], ['10.0.3.13', '10.0.3.14'], ['10.0.3.12'], null],
    })
    expect(topology.edges).toHaveLength(2)
    expect(topology.rejectedEdgeCount).toBe(2)
    const mermaid = buildTopologyMermaid(topology)
    expect(mermaid).toContain('host_1 --- host_0')
    expect(mermaid).toContain('host_1 --- host_2')
    expect(mermaid).not.toContain('host_0 --- host_2')
  })

  it('uses synthetic identifiers and escapes unsafe host labels before generating Mermaid', () => {
    const hostileLabel = 'host"]\nclick host_0 "javascript:alert(1)"<script>'
    const graph = buildTopologyMermaid(normalizeTopology({ hosts: [hostileLabel] }))
    expect(graph).not.toContain(hostileLabel)
    expect(graph).not.toContain('<script>')
    expect(graph).not.toContain('\nclick')
    expect(graph).toContain('host_0["host#34;#93;#10;')
  })
})

describe('resource and scheduling requests', () => {
  beforeEach(() => vi.resetAllMocks())
  afterEach(() => vi.useRealTimers())

  function mockRequestUntilAborted() {
    vi.mocked(requestJson).mockImplementation((_path, options) => {
      const requestSignal = options?.signal
      if (!requestSignal) throw new Error('Expected a cancellation signal')
      return new Promise((_resolve, reject) => {
        requestSignal.addEventListener('abort', () => reject(requestSignal.reason), { once: true })
      })
    })
  }

  it('passes cancellation signals to diagnosis, report, and host resource requests', async () => {
    const controller = new AbortController()
    const record = createRecord()
    vi.mocked(requestJson).mockResolvedValueOnce({}).mockResolvedValueOnce({ device_summary: 'host' })
    vi.mocked(requestText).mockResolvedValue('report')
    await fetchDiagnosis(record, controller.signal)
    await fetchDiagnosisReport(record.report_url!, controller.signal)
    await fetchHostAnalysis('/api/resources/host', controller.signal)
    expect(requestJson).toHaveBeenNthCalledWith(1, record.diagnosis_url, { signal: controller.signal })
    expect(requestText).toHaveBeenCalledWith(record.report_url, { signal: controller.signal })
    expect(requestJson).toHaveBeenNthCalledWith(2, '/api/resources/host', { signal: controller.signal })
  })

  it('rejects external and protocol-relative resource URLs before fetch', async () => {
    const controller = new AbortController()
    for (const path of ['https://other.example/report', '//other.example/report', '/\\other.example/report', 'javascript:alert(1)']) {
      const record = createRecord()
      record.diagnosis_url = path
      await expect(fetchDiagnosis(record, controller.signal)).rejects.toThrow('同源')
    }
    expect(requestJson).not.toHaveBeenCalled()
  })

  it('checks capability and posts the event ID, not the unique record ID', async () => {
    const controller = new AbortController()
    const record = createRecord()
    record.capabilities.scheduling = false
    await expect(fetchSchedulingAdvice(record, controller.signal)).rejects.toThrow('不支持')
    expect(requestJson).not.toHaveBeenCalled()
    record.capabilities.scheduling = true
    vi.useFakeTimers()
    vi.mocked(requestJson).mockResolvedValue({ advice: { review_required: true } })
    await expect(fetchSchedulingAdvice(record, controller.signal)).resolves.toEqual({ advice: { review_required: true } })
    expect(requestJson).toHaveBeenCalledWith('/api/scheduling-advice', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_id: record.event_id }), signal: expect.any(AbortSignal),
    })
    expect(vi.getTimerCount()).toBe(0)
  })

  it('aborts a stalled scheduling request and reports a timeout without aborting the view signal', async () => {
    vi.useFakeTimers()
    mockRequestUntilAborted()
    const controller = new AbortController()
    const pendingRequest = fetchSchedulingAdvice(createRecord(), controller.signal)
    const timeoutAssertion = expect(pendingRequest).rejects.toThrow('调度建议请求超时（105 秒）')
    await vi.advanceTimersByTimeAsync(104_999)
    expect(vi.mocked(requestJson).mock.calls[0]?.[1]?.signal?.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    await timeoutAssertion
    expect(controller.signal.aborted).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('propagates record-switch cancellation without reporting it as a timeout', async () => {
    vi.useFakeTimers()
    mockRequestUntilAborted()
    const controller = new AbortController()
    const pendingRequest = fetchSchedulingAdvice(createRecord(), controller.signal)
    const cancellationAssertion = expect(pendingRequest).rejects.toMatchObject({ name: 'AbortError' })
    controller.abort()
    await cancellationAssertion
    expect(vi.mocked(requestJson).mock.calls[0]?.[1]?.signal?.aborted).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('does not start a request after its caller has already cancelled', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(fetchSchedulingAdvice(createRecord(), controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
    expect(requestJson).not.toHaveBeenCalled()
  })

  it('preserves backend error details and clears the timeout on failure', async () => {
    vi.useFakeTimers()
    vi.mocked(requestJson).mockRejectedValue(new Error('服务器无法连接模型服务'))
    await expect(fetchSchedulingAdvice(createRecord(), new AbortController().signal)).rejects.toThrow('服务器无法连接模型服务')
    expect(vi.getTimerCount()).toBe(0)
  })
})
