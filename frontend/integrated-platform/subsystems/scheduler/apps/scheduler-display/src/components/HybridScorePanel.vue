<script setup lang="ts">
import { computed } from 'vue'
import { BrainCircuit, ChevronLeft, ChevronRight } from 'lucide-vue-next'
import SdPanel from '@/components/ui/SdPanel.vue'
import SdButton from '@/components/ui/SdButton.vue'
import SdBadge from '@/components/ui/SdBadge.vue'
import SdEmptyState from '@/components/ui/SdEmptyState.vue'
import type { FinalScoreDecision, ObservedScheduling } from '@/types/scheduler'

const props = withDefaults(
  defineProps<{
    observed: ObservedScheduling | null
    /** Weighted node scores taken from the scheduler's own log, when available. */
    finalScore?: FinalScoreDecision | null
    /** 1-based position within the browsable history. */
    index?: number
    total?: number
    /** Decisions newer than the one being viewed (0 while following the newest). */
    newerCount?: number
  }>(),
  {
    finalScore: null,
    index: 0,
    total: 0,
    newerCount: 0,
  },
)

defineEmits<{
  previous: []
  next: []
  jumpToLatest: []
}>()

const profileLabels: Record<string, string> = {
  'cpu-intensive': 'CPU 密集型',
  'memory-intensive': '内存密集型',
  'resource-hungry': '资源饥渴型',
  balanced: '均衡型',
}

const pluginLabels: Record<string, string> = {
  TaintToleration: '污点容忍',
  NodeResourcesFit: '资源适配',
  NodeResourcesBalancedAllocation: '资源均衡',
  ImageLocality: '镜像本地性',
  HybridScore: 'HybridScore',
}

const atFirst = computed(() => props.index <= 1)
const atLast = computed(() => props.index >= props.total)

const headlineScore = computed(() => {
  const score = props.finalScore
  if (score) {
    return score.nodes.find((node) => node.node === props.observed?.nodeName)?.total ?? score.bestScore
  }

  return props.observed ? props.observed.score : '—'
})

/** Plugins that actually scored the chosen node, in the scheduler's own order. */
const pluginSummary = computed(() => {
  const score = props.finalScore
  if (!score || !props.observed) return ''

  const chosen = score.nodes.find((node) => node.node === props.observed?.nodeName) ?? score.nodes[0]
  if (!chosen) return ''

  const parts = chosen.plugins
    .map((plugin) => `${pluginLabels[plugin.name] ?? plugin.name} ${plugin.score}`)
    .join(' + ')

  const tie = score.bestNodes.length > 1 ? ` · 最高分并列 ${score.bestNodes.length} 个节点，随机择一` : ''
  return `${parts}${tie}`
})
</script>

<template>
  <SdPanel class="sd-score-panel">
    <template #title>调度决策明细</template>
    <template #description>{{ finalScore ? '最终得分由调度器日志读出' : '查看调度器实际选中的节点' }}</template>
    <template #actions><SdBadge tone="info" :aria-label="`得分 ${headlineScore}`">{{ headlineScore }} 分</SdBadge></template>
    <template #toolbar>
      <div class="sd-history">
        <div class="sd-history-controls">
          <SdButton variant="secondary" size="icon" title="上一个决策" aria-label="上一个决策" :disabled="atFirst" @click="$emit('previous')"><ChevronLeft aria-hidden="true" /></SdButton>
          <SdButton variant="secondary" size="icon" title="下一个决策" aria-label="下一个决策" :disabled="atLast" @click="$emit('next')"><ChevronRight aria-hidden="true" /></SdButton>
          <span class="sd-history-index">{{ total > 0 ? `${index} / ${total}` : '— / —' }}</span>
        </div>
        <SdButton v-if="newerCount > 0" variant="secondary" size="sm" @click="$emit('jumpToLatest')">{{ newerCount }} 条新决策</SdButton>
        <span v-else class="sd-caption">{{ total > 0 ? '跟随最新' : '等待绑定' }}</span>
      </div>
    </template>
    <SdEmptyState v-if="!observed" title="等待调度器绑定" description="创建测试 Pod 后，这里会显示调度结果与得分">
      <template #icon><BrainCircuit :size="18" /></template>
    </SdEmptyState>
    <div v-else :key="observed.id" class="sd-content-reveal">
      <p class="sd-task-name sd-ellipsis" :title="observed.task.name">{{ observed.task.name }}</p>
      <div class="sd-score-tags"><SdBadge tone="info">{{ observed.nodeName }}</SdBadge><SdBadge>{{ profileLabels[observed.profile] ?? observed.profile }}</SdBadge></div>
      <div v-if="finalScore">
        <h3 class="sd-score-heading">调度器最终得分</h3>
        <div class="sd-table-scroll" data-visual-region="data-table" tabindex="0" role="region" aria-label="候选节点评分表">
          <table class="sd-score-table" data-slot="table" aria-label="候选节点评分">
            <thead data-slot="table-header"><tr><th scope="col" data-slot="table-head">候选节点</th><th scope="col" data-slot="table-head">最终分</th><th scope="col" data-slot="table-head">与最高分</th></tr></thead>
            <tbody>
              <tr v-for="node in finalScore.nodes" :key="node.node" :data-selected="node.node === observed.nodeName" data-slot="table-row">
                <td data-slot="table-cell"><span class="sd-wrap">{{ node.node }}</span><span v-if="node.node === observed.nodeName" class="sd-selected-label">选中</span></td>
                <td data-slot="table-cell">{{ node.total }}</td>
                <td data-slot="table-cell">{{ node.total === finalScore.bestScore ? '最高' : `-${finalScore.bestScore - node.total}` }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="sd-score-note">各插件加权贡献：{{ pluginSummary }}</p>
      </div>
      <p v-else class="sd-score-note sd-score-waiting">正在读取调度器最终得分，通常需 1～2 秒。</p>
      <p class="sd-score-note">最终分由 5 个插件加权求和：污点容忍权重为 3，资源适配、资源均衡、镜像本地性和 HybridScore 权重均为 1。</p>
    </div>
  </SdPanel>
</template>
