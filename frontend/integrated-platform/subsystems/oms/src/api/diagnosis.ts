import { requestJson, requestText } from './client'
import type { EventRecord } from './types'

export type JsonObject = Record<string, unknown>

export interface DiagnosticFinding {
  title: string
  description: string
  confidence: string
  severity: string
  hosts: string[]
  services: string[]
  evidence: string[]
}

export interface DeviceAnalysis {
  summary: string
  risk: string
  confidence: string
  findings: DiagnosticFinding[]
  services: { name: string; risk: string; summary: string }[]
  usage: JsonObject
}

export interface DiagnosticHost {
  address: string
  analysisUrl: string | null
  analysis: DeviceAnalysis | null
  temporal: JsonObject
}

export interface DiagnosticTopology {
  hosts: string[]
  edges: { source: string; target: string; directed: boolean }[]
  description: string
  hasExplicitHosts: boolean
  rejectedEdgeCount: number
}

export interface DiagnosisDetail {
  summary: string
  statement: string
  rationale: string
  severity: string
  primaryHost: string
  category: string
  confidence: string
  generatedAt: string
  model: string
  propagation: DiagnosticFinding[]
  causes: DiagnosticFinding[]
  hosts: DiagnosticHost[]
  topology: DiagnosticTopology
  usage: JsonObject
  raw: JsonObject
}

export function asObject(value: unknown): JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonObject
    : {}
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

export function asText(value: unknown): string {
  return typeof value === 'string' ? value : typeof value === 'number' ? String(value) : ''
}

export function prettyJson(value: unknown): string {
  return JSON.stringify(value, null, 2) ?? ''
}

// Evidence is not always a reference string: preserve structured payloads without HTML.
export function normalizeEvidence(value: unknown): string[] {
  const entries = Array.isArray(value) ? value : value == null ? [] : [value]
  return entries
    .filter((entry) => entry !== null && entry !== undefined)
    .map((entry) => typeof entry === 'string' ? entry : prettyJson(entry))
    .filter(Boolean)
}

function normalizeStrings(value: unknown): string[] {
  return asArray(value).map(asText).filter(Boolean)
}

function normalizeFinding(value: unknown): DiagnosticFinding {
  const finding = asObject(value)
  return {
    title: asText(finding.stage ?? finding.cause ?? finding.finding),
    description: typeof value === 'string' ? value : asText(finding.description),
    confidence: asText(finding.confidence),
    severity: asText(finding.severity),
    hosts: normalizeStrings(finding.impacted_hosts),
    services: normalizeStrings(finding.impacted_services),
    evidence: normalizeEvidence(finding.evidence_refs ?? finding.evidence),
  }
}

export function normalizeDeviceAnalysis(value: unknown): DeviceAnalysis | null {
  const root = asObject(value)
  const model = asObject(root.llm)
  const output = asObject(model.llm_output)
  const analysis = asObject(output.device_analysis ?? root.device_analysis ?? root)
  if (!['device_summary', 'overall_risk', 'cross_service_findings', 'service_assessments']
    .some((field) => field in analysis)) return null

  return {
    summary: asText(analysis.device_summary),
    risk: asText(analysis.overall_risk),
    confidence: asText(analysis.confidence),
    findings: asArray(analysis.cross_service_findings).map(normalizeFinding),
    services: asArray(analysis.service_assessments).map((value) => {
      const service = asObject(value)
      return {
        name: asText(service.service),
        risk: asText(service.risk),
        summary: asText(service.summary),
      }
    }),
    usage: asObject(model.usage ?? root.usage),
  }
}

function getHostAddress(value: unknown): string {
  const host = asObject(value)
  return asText(typeof value === 'string' ? value : host.host_ip ?? host.id)
}

export function normalizeTopology(value: unknown, knownHosts: string[] = []): DiagnosticTopology {
  const topology = asObject(value)
  const explicitHosts = [...asArray(topology.hosts), ...asArray(topology.nodes)]
    .map(getHostAddress).filter(Boolean)
  const hosts = new Set([...explicitHosts, ...knownHosts])
  const edges: DiagnosticTopology['edges'] = []
  const seenEdges = new Set<string>()
  let rejectedEdgeCount = 0

  // Only the input topology can supply physical edges. Missing edges stay missing.
  for (const value of asArray(topology.edges)) {
    const edge = asObject(value)
    const source = getHostAddress(Array.isArray(value) ? value[0] : edge.source ?? edge.from)
    const target = getHostAddress(Array.isArray(value) ? value[1] : edge.target ?? edge.to)
    if (!source || !target) {
      rejectedEdgeCount += 1
      continue
    }
    const directed = !Array.isArray(value) && edge.directed === true
    const endpoints = directed ? [source, target] : [source, target].sort()
    const edgeKey = JSON.stringify([directed, ...endpoints])
    if (seenEdges.has(edgeKey)) continue
    seenEdges.add(edgeKey)
    hosts.add(source)
    hosts.add(target)
    edges.push({ source, target, directed })
  }

  return {
    hosts: [...hosts],
    edges,
    description: asText(topology.description),
    hasExplicitHosts: explicitHosts.length > 0,
    rejectedEdgeCount,
  }
}

export function normalizeDiagnosis(value: unknown, record?: EventRecord): DiagnosisDetail {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('诊断文件不是有效的 JSON 对象。')
  }
  const root = asObject(value)
  const model = asObject(root.llm)
  const output = asObject(model.llm_output)
  const diagnosis = asObject(output.event_diagnosis ?? root.event_diagnosis)
  const finalDiagnosis = asObject(diagnosis.final_diagnosis)
  const temporal = asObject(root.host_temporal_features)
  const hostMap = new Map<string, DiagnosticHost>()

  function addHost(address: string): DiagnosticHost | null {
    if (!address) return null
    let host = hostMap.get(address)
    if (!host) {
      host = { address, analysisUrl: null, analysis: null, temporal: asObject(temporal[address]) }
      hostMap.set(address, host)
    }
    return host
  }

  for (const value of asArray(record?.hosts)) {
    const entry = asObject(value)
    const host = addHost(asText(entry.host_ip))
    if (host) host.analysisUrl = asText(entry.analysis_url) || null
  }
  for (const value of asArray(root.host_analyses)) {
    const entry = asObject(value)
    const host = addHost(asText(entry.host_ip))
    if (host) host.analysis = normalizeDeviceAnalysis(entry)
  }
  for (const address of Object.keys(temporal)) addHost(address)

  // Only an explicitly named diagnosis host adds a node; catalog display fallbacks do not.
  const primaryHost = asText(diagnosis.primary_failed_host).trim()
  if (primaryHost) addHost(primaryHost)
  const topology = normalizeTopology(asObject(root.input_context).topology, [...hostMap.keys()])
  for (const address of topology.hosts) addHost(address)

  return {
    summary: asText(diagnosis.executive_summary) || record?.summary || '',
    statement: asText(finalDiagnosis.statement),
    rationale: asText(finalDiagnosis.differential_rationale),
    severity: asText(diagnosis.overall_severity) || record?.overall_severity || '',
    primaryHost,
    category: asText(finalDiagnosis.root_cause_category) || record?.root_cause_category || '',
    confidence: asText(finalDiagnosis.confidence) || record?.confidence || '',
    generatedAt: asText(root.generated_at) || record?.generated_at || '',
    model: asText(model.model),
    propagation: asArray(diagnosis.fault_propagation).map(normalizeFinding),
    causes: asArray(diagnosis.suspected_root_causes).map(normalizeFinding),
    hosts: [...hostMap.values()],
    topology,
    usage: asObject(model.usage),
    raw: root,
  }
}

function escapeMermaidLabel(value: string): string {
  return [...value].map((character) => /[\p{L}\p{N} .:_-]/u.test(character)
    ? character : `#${character.codePointAt(0)};`).join('')
}

export function getTopologyAnnotations(topology: DiagnosticTopology, primaryHost: string, causes: DiagnosticFinding[]) {
  const knownHosts = new Set(topology.hosts)
  const impactedHosts = [...new Set(causes.flatMap((cause) => cause.hosts))]
    .filter((host) => knownHosts.has(host) && host !== primaryHost)
  const inferredRelationships = primaryHost && knownHosts.has(primaryHost)
    ? impactedHosts.map((target) => ({ source: primaryHost, target }))
    : []
  return { impactedHosts, inferredRelationships }
}

export function buildTopologyMermaid(topology: DiagnosticTopology, primaryHost = '', causes: DiagnosticFinding[] = []): string {
  const annotations = getTopologyAnnotations(topology, primaryHost, causes)
  const impactedHosts = new Set(annotations.impactedHosts)
  const identifiers = new Map(topology.hosts.map((host, index) => [host, `host_${index}`]))
  const lines = [
    'flowchart LR',
    'classDef host fill:#ffffff,stroke:#737373,color:#171717,stroke-width:1px',
    'classDef primary fill:#ffffff,stroke:#000000,color:#171717,stroke-width:3px',
    'classDef impacted fill:#ffffff,stroke:#737373,color:#171717,stroke-width:2px,stroke-dasharray:5 3',
  ]
  for (const host of topology.hosts) {
    const status = host === primaryHost ? 'primary' : impactedHosts.has(host) ? 'impacted' : 'host'
    const suffix = status === 'primary' ? ' / 首要故障' : status === 'impacted' ? ' / 受影响（模型标注）' : ''
    lines.push(`${identifiers.get(host)}["${escapeMermaidLabel(host + suffix)}"]:::${status}`)
  }
  for (const edge of topology.edges) {
    const source = identifiers.get(edge.source)
    const target = identifiers.get(edge.target)
    if (source && target) lines.push(`${source} ${edge.directed ? '-->' : '---'} ${target}`)
  }
  for (const relationship of annotations.inferredRelationships) {
    lines.push(`${identifiers.get(relationship.source)} -. 推断关联 .-> ${identifiers.get(relationship.target)}`)
  }
  return lines.join('\n')
}

function requireResourcePath(path: string): string {
  // Catalog resources are same-origin paths, never arbitrary navigation targets.
  const hasUnsafeCharacters = [...path].some((character) => character.charCodeAt(0) <= 32 || character === '\\')
  if (!path.startsWith('/') || path.startsWith('//') || hasUnsafeCharacters) {
    throw new Error('资源地址无效，仅支持同源资源路径。')
  }
  return path
}

export async function fetchDiagnosis(record: EventRecord, signal: AbortSignal): Promise<DiagnosisDetail> {
  const result = await requestJson<unknown>(requireResourcePath(record.diagnosis_url), { signal })
  return normalizeDiagnosis(result, record)
}

export function fetchDiagnosisReport(path: string, signal: AbortSignal): Promise<string> {
  return requestText(requireResourcePath(path), { signal })
}

export async function fetchHostAnalysis(path: string, signal: AbortSignal): Promise<DeviceAnalysis> {
  const result = await requestJson<unknown>(requireResourcePath(path), { signal })
  const analysis = normalizeDeviceAnalysis(result)
  if (!analysis) throw new Error('主机文件中没有可识别的分析数据。')
  return analysis
}

export async function fetchSchedulingAdvice(record: EventRecord, signal: AbortSignal): Promise<JsonObject> {
  if (!record.capabilities?.scheduling) throw new Error('此记录不支持生成调度建议。')
  signal.throwIfAborted()
  const requestController = new AbortController()
  const cancelRequest = () => requestController.abort(signal.reason)
  signal.addEventListener('abort', cancelRequest, { once: true })
  let timedOut = false
  // Allow the backend's 90-second model timeout to return its error first.
  const timeoutId = setTimeout(() => {
    timedOut = true
    requestController.abort()
  }, 105_000)
  try {
    const result = await requestJson<unknown>('/api/scheduling-advice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_id: record.event_id }),
      signal: requestController.signal,
    })
    return asObject(result)
  } catch (failure) {
    if (timedOut && !signal.aborted) {
      throw new Error('调度建议请求超时（105 秒）。请检查后端到模型服务的网络连接及模型服务状态后重试。', { cause: failure })
    }
    throw failure
  } finally {
    clearTimeout(timeoutId)
    signal.removeEventListener('abort', cancelRequest)
  }
}

export function getRequestError(error: unknown): string {
  return error instanceof Error ? error.message : '请求失败，请稍后重试。'
}
