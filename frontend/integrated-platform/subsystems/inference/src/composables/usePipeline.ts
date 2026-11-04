import { reactive } from 'vue'
import {
  ACTION_LABELS,
  ROUTE_LABELS,
  STAGE_ACTIVE_TEXT,
  STAGE_NAMES,
} from '@/constants/inference'
import type { PipelineState, StageDoneEvent, StageName } from '@/types/inference'

const newStages = () => ({
  extract: { name: 'extract' as const, status: 'idle' as const, detail: '等待中', latency: null },
  assess: { name: 'assess' as const, status: 'idle' as const, detail: '等待中', latency: null },
  route: { name: 'route' as const, status: 'idle' as const, detail: '等待中', latency: null },
})

export function usePipeline() {
  const pipeline = reactive<PipelineState>({
    visible: false,
    mode: 'video',
    currentFile: '',
    currentIndex: 0,
    total: 0,
    log: '等待中…',
    stages: newStages(),
  })

  function reset(video: string, index: number, total: number) {
    pipeline.visible = true
    pipeline.mode = 'video'
    pipeline.currentFile = video
    pipeline.currentIndex = index
    pipeline.total = total
    pipeline.log = '等待中…'
    pipeline.stages = newStages()
  }

  function startText() {
    pipeline.visible = true
    pipeline.mode = 'text'
    pipeline.currentFile = ''
    pipeline.currentIndex = 0
    pipeline.total = 0
    pipeline.log = '正在等待云端回答…'
  }

  function finishText() {
    pipeline.visible = false
  }

  function activate(stage: StageName) {
    const state = pipeline.stages[stage]
    state.status = 'active'
    state.detail = STAGE_ACTIVE_TEXT[stage]
    pipeline.log = state.detail
  }

  function complete(event: StageDoneEvent) {
    const state = pipeline.stages[event.stage]
    state.status = 'done'
    state.latency = event.latency
    if (event.stage === 'extract') {
      state.detail = `${event.frames ?? 0} 帧 · 难度 ${event.difficulty ?? 0}`
    } else if (event.stage === 'assess') {
      state.detail = `${ACTION_LABELS[event.action ?? ''] ?? event.action ?? '已完成'} · 综合分 ${event.score ?? 0}`
    } else {
      state.detail = ROUTE_LABELS[event.path ?? ''] ?? event.path ?? '已完成'
    }
    pipeline.log = `${STAGE_NAMES[event.stage]}完成 · ${event.latency}s`
  }

  function fail(message: string) {
    pipeline.log = message
    const active = Object.values(pipeline.stages).find((stage) => stage.status === 'active')
    if (active) active.status = 'error'
  }

  return { pipeline, reset, startText, finishText, activate, complete, fail }
}
