import type { StageName } from '@/types/inference'

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'

export const ROUTE_LABELS: Record<string, string> = {
  stay_edge_verified: '边缘验收通过',
  stay_edge_after_dual_probe: '双探针后保留边缘',
  local_resample_then_edge: '补看后保留边缘',
  local_resample_then_cloud: '补看后升级云端',
  direct_cloud: '直接云端复核',
  edge_failed_cloud: '边缘失败 · 云端接管',
  edge_answer_failed_cloud: '边缘回答失败 · 云端接管',
  cloud_failed: '云端失败 · 边缘降级',
}

export const ACTION_LABELS: Record<string, string> = {
  stay_edge: '保留边缘',
  local_resample: '混合策略分析',
  send_cloud: '升级云端',
}

export const STAGE_NAMES: Record<StageName, string> = {
  extract: '抽帧',
  assess: '任务评估',
  route: '网络路由',
}

export const STAGE_ACTIVE_TEXT: Record<StageName, string> = {
  extract: '正在解码视频帧…',
  assess: '双采样边缘推理…',
  route: '执行路由决策…',
}
