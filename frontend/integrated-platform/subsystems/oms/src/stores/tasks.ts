import { computed, onScopeDispose, ref } from 'vue'
import { defineStore } from 'pinia'
import { ApiError, errorMessage, requestJson } from '../api/client'
import type { DiagnosisTask } from '../api/types'
import { TASK_POLL_INTERVAL } from '../../system_config'
import { useEventsStore } from './events'

export const useTasksStore = defineStore('tasks', () => {
  const taskId = ref('')
  const task = ref<DiagnosisTask | null>(null)
  const error = ref('')
  const starting = ref(false)
  const stopping = ref(false)
  const visible = ref(false)
  const running = computed(() => task.value?.status === 'running' || task.value?.status === 'queued')
  let timer: ReturnType<typeof setTimeout> | undefined
  let controller: AbortController | undefined
  let generation = 0
  let restored = false

  function stopPolling() {
    generation += 1
    clearTimeout(timer)
    controller?.abort()
  }

  async function poll(currentGeneration: number) {
    const pollController = new AbortController()
    controller = pollController
    const timeout = setTimeout(() => pollController.abort(), 15_000)
    try {
      const result = await requestJson<DiagnosisTask>(`/api/task/${encodeURIComponent(taskId.value)}`, { signal: pollController.signal })
      if (currentGeneration !== generation) return
      task.value = result
      error.value = ''
      if (result.status !== 'running' && result.status !== 'queued') {
        // A stopped multi-event task may still have finished some events.
        if (result.status === 'completed' || result.status === 'stopped') await useEventsStore().loadEvents()
        return
      }
    } catch (reason) {
      if (currentGeneration !== generation) return
      error.value = errorMessage(reason)
      if (reason instanceof ApiError && reason.status === 404) {
        task.value = null
        error.value = '任务已不存在，后端可能已重启。请核对结果后再启动新任务。'
        return
      }
    } finally { clearTimeout(timeout) }
    if (currentGeneration === generation) {
      timer = setTimeout(() => { void poll(currentGeneration) }, TASK_POLL_INTERVAL)
    }
  }

  function track(identifier: string, initialTask: DiagnosisTask) {
    stopPolling()
    taskId.value = identifier
    task.value = initialTask
    visible.value = true
    void poll(generation)
  }

  async function startDiagnosis(eventIds: string[]) {
    if (running.value || starting.value) throw new Error('已有诊断任务运行中，请等待完成')
    starting.value = true
    error.value = ''
    try {
      const result = await requestJson<{ task_id: string }>('/api/run-diagnosis', {
        method: 'POST', body: JSON.stringify({ event_ids: eventIds }),
      })
      track(result.task_id, {
        status: 'running', progress: 0, message: '任务已提交',
        started_at: new Date().toISOString(), event_ids: eventIds,
      })
    } finally { starting.value = false }
  }

  async function stopTask() {
    if (!taskId.value || !running.value || stopping.value) return
    stopping.value = true
    try {
      task.value = await requestJson<DiagnosisTask>(`/api/task/${encodeURIComponent(taskId.value)}/stop`, { method: 'POST' })
      // Polling continues until the worker reports the final stopped state.
    } finally { stopping.value = false }
  }

  async function restoreRunningTask() {
    if (restored) return
    restored = true
    try {
      const tasks = await requestJson<Record<string, DiagnosisTask>>('/api/tasks')
      if (taskId.value || starting.value) return
      const existing = Object.entries(tasks).find(([, candidate]) => candidate.status === 'running' || candidate.status === 'queued')
      if (existing) track(existing[0], existing[1])
    } catch { restored = false }
  }

  onScopeDispose(stopPolling)
  return { taskId, task, error, starting, stopping, visible, running, startDiagnosis, stopTask, restoreRunningTask }
})
