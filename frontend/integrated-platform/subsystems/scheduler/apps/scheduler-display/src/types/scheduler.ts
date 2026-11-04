export type SchedulerStrategy = 'ClassicScheduler' | 'LLMScheduler' | 'HybridScheduler'

export type RuntimeMode = 'mock' | 'k8s'

export type LogTone = 'info' | 'success' | 'warning' | 'error' | 'muted'

export interface Task {
  id: string
  name: string
  reqCpu: number
  reqMem: number
  createdAt: number
  image: string
  priority: 'low' | 'normal' | 'high'
}

export interface ScheduledPod extends Task {
  boundAt: number
  /** True when this page created the pod, i.e. it may be deleted from here. */
  managed?: boolean
}

export interface ClusterNode {
  id: string
  name: string
  zone: string
  role: string
  capacityCpu: number
  capacityMem: number
  observedCpu?: number
  observedMem?: number
  observedAt?: number
  metricsSource?: 'metrics-server'
  usedCpu: number
  usedMem: number
  podCount?: number
  pods: ScheduledPod[]
}

export interface FailedTask extends Task {
  failedAt: number
  reason: string
}

export interface LogEntry {
  id: string
  timestamp: number
  tone: LogTone
  message: string
}

export interface ActiveFlight {
  id: string
  task: Task
  targetNodeId: string
  score: number
}

export interface NodeTelemetry {
  cpuNoise: number
  memNoise: number
}

export interface HybridScoreComponent {
  name: string
  weight: number
  value: number
  contribution: number
}

export interface PluginScore {
  name: string
  score: number
}

export interface FinalNodeScore {
  node: string
  total: number
  plugins: PluginScore[]
}

/** The scheduler's own weighted node scores, read from its verbose log. */
export interface FinalScoreDecision {
  podKey: string
  nodes: FinalNodeScore[]
  bestScore: number
  bestNodes: string[]
  chosenNode?: string
  scoredAt: number
}

/** A binding performed by the real scheduler and observed by the proxy. */
export interface ObservedScheduling {
  id: string
  task: Task
  nodeName: string
  scheduledAt: number
  latencyMs: number
  profile: string
  intentSha256: string
  score: number
  components: HybridScoreComponent[]
}

/**
 * Wire shape of one binding. It is carried by the `scheduled` event and
 * repeated in every snapshot so a client that missed an event can reconcile.
 */
export type ScheduledPayload = Omit<ObservedScheduling, 'score' | 'components'> & {
  score: { total: number; components: HybridScoreComponent[] }
}

export interface K8sSnapshot {
  nodes: ClusterNode[]
  pendingQueue: Task[]
  failedTasks?: FailedTask[]
}

export type K8sConnectionStatus = 'mock' | 'connecting' | 'connected' | 'disconnected' | 'error'

export interface K8sStreamEvent {
  type: 'snapshot' | 'task' | 'nodeUpdate' | 'failed' | 'log' | 'scheduled' | 'finalScore'
  id?: string
  nodes?: ClusterNode[]
  pendingQueue?: Task[]
  failedTasks?: FailedTask[]
  task?: Task
  reason?: string
  message?: string
  tone?: LogTone
  nodeName?: string
  scheduledAt?: number
  latencyMs?: number
  profile?: string
  intentSha256?: string
  score?: { total: number; components: HybridScoreComponent[] }
  recentScheduled?: ScheduledPayload[]
  finalScore?: FinalScoreDecision
  recentFinalScores?: FinalScoreDecision[]
  serverNow?: number
}

export interface LogPayload {
  message: string
  tone?: LogTone
}
