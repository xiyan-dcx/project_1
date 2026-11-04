export interface CaaSRunRequest {
  num: number
  threads: number
  value_size: number
  repeats: number
}

export interface ReadyComponent {
  ready?: boolean
  address?: string
  datanode_stream_ready?: boolean
  missing_blocks?: number
  corrupt_blocks?: number
}

export interface DppOnlineValidation extends ReadyComponent {
  passed?: boolean
  gate_status?: string
  checked_stripes?: number
  mismatches?: number
  dpp_partial_writes_test?: number
  dpp_bytes_test?: number
  dpp_failures?: number
  fault_recovery?: boolean
  post_recovery_sha256_match?: boolean
  hdfs_missing_blocks?: number
  hdfs_corrupt_blocks?: number
  validated_at?: string
}

export interface CaaSHealth {
  ok: boolean
  error?: string
  hdfs?: ReadyComponent
  procp?: ReadyComponent
  csa?: ReadyComponent
  dpp_online?: DppOnlineValidation
  binary_ready?: boolean
  runner_state?: string
  active_job?: string | null
  kubernetes_native?: boolean
  storage_backend?: string
}

export interface LatencyPercentiles {
  p50?: number
  p95?: number
  p99?: number
  max?: number
}

export interface ComparisonRun {
  ops_per_sec: number
  mb_per_sec?: number
  seconds?: number
  remote_compactions?: number
  write_latency_us?: LatencyPercentiles
  repeat?: number
  lsm_config?: Record<string, number>
}

export interface ComparisonSide extends ComparisonRun {
  ops_per_sec_cv_percent?: number
  runs?: ComparisonRun[]
}

export interface AcceptanceResult {
  formal_run: boolean
  throughput_improved: boolean
  stable: boolean
  remote_path_exercised: boolean
  dpp_online_verified: boolean
  minimum_repeats: number
  max_cv_percent: number
  passed: boolean
}

export interface CaaSComparison {
  local?: ComparisonSide
  caas?: ComparisonSide
  improvement?: {
    throughput_percent?: number
    p99_reduction_percent?: number
    write_time_reduction_percent?: number
  }
  acceptance?: AcceptanceResult
  storage_path?: string
  result_json?: string
  dpp_online_validation?: DppOnlineValidation
  parameters?: CaaSRunRequest
}

export interface CaaSJob {
  job_id?: string
  state: string
  message?: string
  error?: string
  comparison?: CaaSComparison
}
