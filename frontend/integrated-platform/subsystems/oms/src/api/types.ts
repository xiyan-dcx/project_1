export type EventStatus = 'open' | 'acknowledged' | 'resolved'

export interface EventRecord {
  record_id: string
  event_id: string
  source: 'real' | 'mock' | 'unknown'
  suite: string | null
  run_id: string | null
  generated_at: string
  /** End of the incident's logs; the diagnosis time when the logs carry no timestamps. */
  occurred_at: string
  occurred_at_estimated: boolean
  primary_failed_host: string
  root_cause_category: string
  confidence: string
  overall_severity: string
  summary: string
  diagnosis_url: string
  report_url: string | null
  hosts: { host_ip: string; analysis_url: string }[]
  impacted_hosts: string[]
  /** Handling state of main-pipeline incidents; null for experiment records. */
  status: EventStatus | null
  status_updated_at: string | null
  resolved_at: string | null
  capabilities: { delete: boolean; diagnose: boolean; scheduling: boolean; status: boolean }
}

export interface EventCatalog {
  status: string
  events: EventRecord[]
  warnings: string[]
}

export interface DiagnosisTask {
  status: 'queued' | 'running' | 'completed' | 'failed' | 'stopped'
  progress: number
  message: string
  started_at: string
  event_ids: string[]
  completed_at?: string
}
