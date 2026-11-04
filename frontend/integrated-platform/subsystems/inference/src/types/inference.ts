export type StageName = 'extract' | 'assess' | 'route'
export type StageStatus = 'idle' | 'active' | 'done' | 'error'

export interface StageState {
  name: StageName
  status: StageStatus
  detail: string
  latency: number | null
}

export interface PipelineState {
  visible: boolean
  mode: 'video' | 'text'
  currentFile: string
  currentIndex: number
  total: number
  log: string
  stages: Record<StageName, StageState>
}

export interface Latencies {
  extract: number
  assess: number
  route: number
  total: number
}

export interface InferenceResult {
  id: number
  video: string | null
  answer: string
  source: string
  routePath: string | null
  latencies: Latencies | null
}

export interface StageStartEvent {
  type: 'stage_start'
  stage: StageName
}

export interface StageDoneEvent {
  type: 'stage_done'
  stage: StageName
  latency: number
  frames?: number
  difficulty?: number
  action?: string
  score?: number
  path?: string
  source?: string
}

export interface ResultEvent {
  type: 'result'
  answer: string
  source: string
  route_path: string
  latencies: Latencies
}

export interface ErrorEvent {
  type: 'error'
  message: string
}

export type AnalyzeEvent = StageStartEvent | StageDoneEvent | ResultEvent | ErrorEvent
