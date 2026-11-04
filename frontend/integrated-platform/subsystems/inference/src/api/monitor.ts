import { apiUrl, requestJson } from './http'

export interface MonitorStatus {
  source: 'rtsp'
  video: string
  preview_url: string
  stream_url: string
  stream_supported: boolean
  available: boolean
  configured: boolean
  analysis_supported: boolean
  analysis_running: boolean
  analysis_stream_url: string
  rtsp_supported: boolean
  message: string
}

export const getMonitor = () => requestJson<MonitorStatus>('/monitor')
export const monitorPreviewUrl = () => apiUrl('/monitor/preview')
export const monitorStreamUrl = () => apiUrl('/monitor/stream/live.m3u8')
export const analysisStreamUrl = () => apiUrl('/monitor/analysis/stream/live.m3u8')

export interface TrackedPerson {
  bbox: number[]
  confidence: number
  track_id: number
  confirmed: boolean
}

export interface MonitorEvent {
  id: string
  run_id: string
  state: 'queued' | 'analyzing' | 'done' | 'error' | 'cancelled' | 'skipped'
  type: 'person_activity'
  start_at: number
  end_at: number
  track_ids: number[]
  summary: string
  error: string
  model?: string
  latency_seconds?: number
  visible_facts?: string[]
  activities?: string[]
  uncertainties?: string[]
}

export interface LiveAnalysisStatus {
  supported: boolean
  running: boolean
  state: 'stopped' | 'connecting' | 'running' | 'offline' | 'error'
  run_id: string
  source: 'rtsp'
  frame_age_seconds: number | null
  person_count: number
  latest: { detections: TrackedPerson[]; frame_sequence: number; received_at: number; latency_ms: number; camera_epoch: number } | null
  target_fps: number
  window_seconds: number
  detection_fps: number
  model_busy: boolean
  pending_event: boolean
  queue_size: number
  cooldown_seconds: number
  stream_url: string
  stream_ready: boolean
  error: string
  stream_error: string
  events: MonitorEvent[]
}

export const getLiveAnalysis = () => requestJson<LiveAnalysisStatus>('/monitor/analysis')
export const startLiveAnalysis = (prompt = '') => requestJson<LiveAnalysisStatus>('/monitor/analysis/start', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source: 'rtsp', prompt }),
})
export const stopLiveAnalysis = () => requestJson<LiveAnalysisStatus>('/monitor/analysis/stop', { method: 'POST' })

export interface MonitorDemo {
  source: 'recording'
  title: string
  filename: string
  video_url: string
  duration: number
  fps: number
  model: string
  device: string
  width: number
  height: number
  max_person_count: number
  mean_detection_ms: number
  timeline: { time: number; person_count: number }[]
  generated_at: string
  analysis: { status: 'done' | 'error'; answer?: string; model?: string; latency_seconds?: number; message?: string }
}

export const getMonitorDemo = () => requestJson<MonitorDemo>('/monitor/demo')
export const monitorDemoVideoUrl = (version: string) => `${apiUrl('/monitor/demo/video.mp4')}?v=${encodeURIComponent(version)}`

