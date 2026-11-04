import { ref } from 'vue'
import { sendChat } from '@/api/chat'
import { analyzeVideo } from '@/api/video'
import type { AnalyzeEvent, InferenceResult } from '@/types/inference'
import { usePipeline } from './usePipeline'

export function useInference() {
  const submitting = ref(false)
  const results = ref<InferenceResult[]>([])
  let nextResultId = 1
  const { pipeline, reset, startText, finishText, activate, complete, fail } = usePipeline()

  function addResult(result: Omit<InferenceResult, 'id'>) {
    results.value.push({ id: nextResultId++, ...result })
  }

  async function runText(prompt: string) {
    startText()
    try {
      const response = await sendChat(prompt)
      addResult({
        video: null,
        answer: response.ok ? (response.answer || '（无输出）') : `失败：${response.error || '未知错误'}`,
        source: response.ok ? 'Cloud (P3-02)' : 'Error',
        routePath: null,
        latencies: null,
      })
    } catch (error) {
      addResult({
        video: null,
        answer: `网络错误：${error instanceof Error ? error.message : String(error)}`,
        source: 'Error',
        routePath: null,
        latencies: null,
      })
    } finally {
      finishText()
    }
  }

  async function runVideo(video: string, prompt: string, index: number, total: number) {
    reset(video, index, total)
    let receivedResult = false
    try {
      const onEvent = async (event: AnalyzeEvent) => {
        if (event.type === 'stage_start') activate(event.stage)
        if (event.type === 'stage_done') complete(event)
        if (event.type === 'error') {
          fail(event.message)
          throw new Error(event.message)
        }
        if (event.type === 'result') {
          receivedResult = true
          await new Promise((resolve) => window.setTimeout(resolve, 250))
          addResult({
            video,
            answer: event.answer,
            source: event.source,
            routePath: event.route_path,
            latencies: event.latencies,
          })
        }
      }
      await analyzeVideo(video, prompt, onEvent)
      if (!receivedResult) throw new Error('推理流已结束，但未返回结果')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      fail(message)
      addResult({ video, answer: `错误：${message}`, source: 'Error', routePath: null, latencies: null })
    }
  }

  async function submit(videos: string[], prompt: string) {
    if (submitting.value) return
    submitting.value = true
    try {
      if (videos.length === 0) await runText(prompt)
      else {
        for (let index = 0; index < videos.length; index += 1) {
          await runVideo(videos[index], prompt, index + 1, videos.length)
        }
      }
    } finally {
      submitting.value = false
    }
  }

  return { submitting, results, pipeline, submit }
}
