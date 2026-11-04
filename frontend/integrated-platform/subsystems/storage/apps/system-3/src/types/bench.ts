export type EngineKey = string
export type RW = 'write' | 'randwrite' | 'read' | 'randread'

export interface EngineDescriptor {
  key: EngineKey
  name: string
  mode: string
  runnable: boolean
  reason: string
}

export interface LatStat {
  min?: number
  max?: number
  avg?: number
  stdev?: number
}

export interface Sample {
  engine: EngineKey
  engine_name: string
  rw: RW
  bs: string
  qd: number
  rt: number
  iops: number
  bw_mib: number
  lat_us: number | null
  lat_min: number | null
  lat_max: number | null
  lat_stdev: number | null
  slat: LatStat
  clat: LatStat
  pct: Record<string, number>
  lat_dist: Record<string, number>
  cpu: { usr?: number; sys?: number; ctx?: number; idle?: number }
  io_depths: Record<string, number>
  bw_stat: LatStat
  iops_stat: LatStat
  ts: number
  series?: Array<{ t: number; iops: number; bw_mib: number }>
  historical?: boolean
}

export type BenchStatus = 'idle' | 'preparing' | 'running' | 'failed'
