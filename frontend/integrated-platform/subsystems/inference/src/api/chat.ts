import { requestJson } from './http'
import type { ChatResponse } from '@/types/api'

export function sendChat(prompt: string): Promise<ChatResponse> {
  return requestJson<ChatResponse>('/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  })
}
