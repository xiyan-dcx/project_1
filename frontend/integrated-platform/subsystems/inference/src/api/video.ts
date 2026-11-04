import { apiUrl, requestJson } from './http'
import { consumeSse } from './sse'
import type { VideosResponse } from '@/types/api'
import type { AnalyzeEvent } from '@/types/inference'

export async function listVideos(): Promise<string[]> {
  const response = await requestJson<VideosResponse>('/videos')
  return response.videos
}

export async function analyzeVideo(
  video: string,
  prompt: string,
  onEvent: (event: AnalyzeEvent) => void | Promise<void>,
): Promise<void> {
  const response = await fetch(apiUrl('/analyze'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ video, prompt }),
  })
  await consumeSse<AnalyzeEvent>(response, onEvent)
}
