import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, requestJson } from '../api/client'
import { useTasksStore } from './tasks'
import { TASK_POLL_INTERVAL } from '../../system_config'

vi.mock('../api/client', async (importOriginal) => ({
  ...await importOriginal<typeof import('../api/client')>(), requestJson: vi.fn(),
}))

describe('diagnosis polling lifecycle', () => {
  let pinia: ReturnType<typeof createPinia>
  beforeEach(() => { vi.useFakeTimers(); vi.mocked(requestJson).mockReset(); pinia = createPinia(); setActivePinia(pinia) })
  afterEach(() => { disposePinia(pinia); vi.useRealTimers() })

  it('keeps polling when hidden and stops after completion, refreshing catalog once', async () => {
    vi.mocked(requestJson)
      .mockResolvedValueOnce({ task_id: 'task-one' })
      .mockResolvedValueOnce({ status: 'running', progress: 0, message: 'parse' })
      .mockResolvedValueOnce({ status: 'completed', progress: 100, message: 'done' })
      .mockResolvedValueOnce({ events: [], warnings: [] })
    const store = useTasksStore()
    await store.startDiagnosis(['event-one'])
    store.visible = false
    await vi.advanceTimersByTimeAsync(TASK_POLL_INTERVAL)
    expect(store.task?.status).toBe('completed')
    expect(requestJson).toHaveBeenCalledWith('/api/events')
    await vi.advanceTimersByTimeAsync(TASK_POLL_INTERVAL * 5)
    expect(requestJson).toHaveBeenCalledTimes(4)
  })

  it('does not start another task while one is running', async () => {
    vi.mocked(requestJson).mockResolvedValueOnce({ task_id: 'task-one' })
      .mockResolvedValueOnce({ status: 'running', progress: 0 })
    const store = useTasksStore()
    await store.startDiagnosis(['event-one'])
    await expect(store.startDiagnosis(['event-two'])).rejects.toThrow('已有诊断任务')
    expect(requestJson).toHaveBeenCalledTimes(2)
  })

  it('restores a queued task and keeps polling until terminal status', async () => {
    vi.mocked(requestJson).mockResolvedValueOnce({ queuedTask: { status: 'queued', progress: 0 } })
      .mockResolvedValueOnce({ status: 'queued', progress: 0 })
      .mockResolvedValueOnce({ status: 'failed', progress: 0, message: 'fixture failure' })
    const store = useTasksStore()
    await store.restoreRunningTask()
    expect(store.running).toBe(true)
    await vi.advanceTimersByTimeAsync(TASK_POLL_INTERVAL)
    expect(store.task?.status).toBe('failed')
    expect(store.running).toBe(false)
    await vi.advanceTimersByTimeAsync(TASK_POLL_INTERVAL * 2)
    expect(requestJson).toHaveBeenCalledTimes(3)
  })

  it('stops a running task and refreshes the catalog once it has stopped', async () => {
    vi.mocked(requestJson).mockResolvedValueOnce({ task_id: 'task/one' })
      .mockResolvedValueOnce({ status: 'running', progress: 20, message: 'digest' })
      .mockResolvedValueOnce({ status: 'running', progress: 20, message: 'Stopping diagnosis' })
      .mockResolvedValueOnce({ status: 'stopped', progress: 20, message: 'stopped' })
      .mockResolvedValueOnce({ events: [], warnings: [] })
    const store = useTasksStore()
    await store.startDiagnosis(['event-one'])
    await store.stopTask()
    expect(requestJson).toHaveBeenNthCalledWith(3, '/api/task/task%2Fone/stop', { method: 'POST' })
    expect(store.task?.message).toBe('Stopping diagnosis')
    await vi.advanceTimersByTimeAsync(TASK_POLL_INTERVAL)
    expect(store.task?.status).toBe('stopped')
    expect(store.running).toBe(false)
    expect(requestJson).toHaveBeenLastCalledWith('/api/events')
    await store.stopTask()
    expect(requestJson).toHaveBeenCalledTimes(5)
  })

  it('stops on missing task instead of polling forever', async () => {
    vi.mocked(requestJson).mockResolvedValueOnce({ task_id: 'task-one' })
      .mockRejectedValueOnce(new ApiError('missing', 404))
    const store = useTasksStore()
    await store.startDiagnosis(['event-one'])
    await vi.advanceTimersByTimeAsync(TASK_POLL_INTERVAL * 3)
    expect(store.task).toBeNull()
    expect(store.error).toContain('后端可能已重启')
    expect(requestJson).toHaveBeenCalledTimes(2)
  })
})
