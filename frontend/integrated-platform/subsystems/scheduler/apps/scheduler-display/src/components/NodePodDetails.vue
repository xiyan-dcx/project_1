<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { ChevronDown, ChevronRight } from 'lucide-vue-next'
import { fetchK8sSnapshot } from '@/api/k8s'
import PodNamespaceTable from '@/components/PodNamespaceTable.vue'
import SdButton from '@/components/ui/SdButton.vue'
import SdEmptyState from '@/components/ui/SdEmptyState.vue'
import type { ClusterNode, ScheduledPod } from '@/types/scheduler'

const props = defineProps<{ node: ClusterNode }>()
defineEmits<{ removePod: [taskId: string] }>()
const fullPods = shallowRef<ScheduledPod[] | null>(null)
const loading = ref(false)
const error = ref('')
const resourceNumber = new Intl.NumberFormat('en', { maximumFractionDigits: 6 })
const search = ref('')
const sortBy = ref<'name' | 'cpu' | 'memory'>('name')
const expandedNamespaces = ref(new Set<string>())
let generation = 0

const pods = computed(() => fullPods.value ?? props.node.pods)
const total = computed(() => props.node.podCount ?? pods.value.length)
const searchTerm = computed(() => search.value.trim().toLocaleLowerCase())
const groups = computed(() => {
  const namespaces = new Map<string, { name: string; pods: ScheduledPod[]; cpu: number; memory: number }>()
  for (const pod of pods.value) {
    const name = pod.id.includes('/') ? pod.id.split('/')[0] || 'default' : 'default'
    let group = namespaces.get(name)
    if (!group) {
      group = { name, pods: [], cpu: 0, memory: 0 }
      namespaces.set(name, group)
    }
    group.pods.push(pod)
    group.cpu += pod.reqCpu
    group.memory += pod.reqMem
  }
  return [...namespaces.values()].map(group => {
    const matches = searchTerm.value
      ? group.pods.filter(pod => pod.id.toLocaleLowerCase().includes(searchTerm.value) || pod.name.toLocaleLowerCase().includes(searchTerm.value))
      : [...group.pods]
    matches.sort((left, right) => {
      const delta = sortBy.value === 'cpu' ? right.reqCpu - left.reqCpu
        : sortBy.value === 'memory' ? right.reqMem - left.reqMem : 0
      return delta || left.id.localeCompare(right.id, 'en', { numeric: true })
    })
    return { ...group, matches }
  }).filter(group => group.matches.length > 0)
    .sort((left, right) => right.pods.length - left.pods.length || left.name.localeCompare(right.name))
})
const matchCount = computed(() => groups.value.reduce((sum, group) => sum + group.matches.length, 0))

function toggleNamespace(name: string) {
  if (expandedNamespaces.value.has(name)) expandedNamespaces.value.delete(name)
  else expandedNamespaces.value.add(name)
}

function namespaceId(name: string) {
  return `sd-namespace-${encodeURIComponent(props.node.id)}-${encodeURIComponent(name)}`
}

// Search reveals matching namespaces; clearing it restores the collapsed overview.
watch(searchTerm, () => {
  if (searchTerm.value) expandedNamespaces.value = new Set(groups.value.map(group => group.name))
  else expandedNamespaces.value = new Set()
})
watch(() => groups.value.map(group => group.name).join('\n'), () => {
  if (searchTerm.value) expandedNamespaces.value = new Set(groups.value.map(group => group.name))
})

async function loadAllPods() {
  const request = ++generation
  error.value = ''
  // Small nodes already have their complete list and stay live through SSE.
  if (props.node.pods.length >= total.value) {
    fullPods.value = null
    loading.value = false
    return
  }
  loading.value = true
  try {
    // The existing backend accepts -1 for all Pods; the normal stream stays capped.
    const snapshot = await fetchK8sSnapshot(-1)
    if (request !== generation) return
    const node = snapshot.nodes.find(item => item.id === props.node.id)
    if (!node) throw new Error('节点已不在集群快照中')
    fullPods.value = node.pods
    if (node.pods.length < (node.podCount ?? node.pods.length)) {
      error.value = `接口仅返回 ${node.pods.length} / ${node.podCount} 个 Pod，请重试。`
    }
  } catch (cause) {
    if (request !== generation) return
    error.value = cause instanceof Error ? cause.message : '读取 Pod 资源失败'
  } finally {
    if (request === generation) loading.value = false
  }
}

watch([() => props.node.id, () => props.node.podCount], () => { void loadAllPods() }, { immediate: true })
onBeforeUnmount(() => { generation++ })
</script>

<template>
  <section class="sd-pod-details" :aria-label="`${node.name} 的 Pod 资源详情`" :aria-busy="loading">
    <p class="sd-caption">CPU、内存为申请量 · 已读取 {{ pods.length }} 个 Pod</p>
    <p v-if="loading" class="sd-caption" role="status">正在读取全部 Pod…</p>
    <div v-if="error" class="sd-pod-load-error" role="alert">
      <p class="sd-wrap">读取全部 Pod 失败：{{ error }}</p>
      <SdButton variant="secondary" size="sm" :disabled="loading" @click="loadAllPods">重试</SdButton>
    </div>
    <SdEmptyState v-if="pods.length === 0 && !loading && !error" title="暂无驻留 Pod" />
    <template v-if="pods.length">
      <div class="sd-pod-controls">
        <label class="sd-pod-search-label"><span class="sd-caption">搜索 Pod</span><input v-model="search" type="search" class="sd-pod-input" placeholder="Pod 名称或命名空间" :aria-label="`${node.name} 搜索 Pod`" /></label>
        <label class="sd-pod-sort-label"><span class="sd-caption">排序</span><select v-model="sortBy" class="sd-pod-input" :aria-label="`${node.name} Pod 排序`"><option value="name">名称</option><option value="cpu">CPU 从高到低</option><option value="memory">内存从高到低</option></select></label>
      </div>
      <p class="sd-caption" role="status">{{ searchTerm ? `找到 ${matchCount} 个 Pod，分布于 ${groups.length} 个命名空间` : `${groups.length} 个命名空间 · 点击分组查看 Pod` }}</p>
      <SdEmptyState v-if="groups.length === 0" title="未找到匹配的 Pod" description="请更换名称或命名空间关键词" />
      <div v-for="group in groups" :key="group.name" class="sd-namespace-group" :data-namespace="group.name">
        <SdButton variant="ghost" class="sd-namespace-toggle" :aria-expanded="expandedNamespaces.has(group.name)" :aria-controls="expandedNamespaces.has(group.name) ? namespaceId(group.name) : undefined" :aria-label="`${expandedNamespaces.has(group.name) ? '收起' : '展开'} ${node.name} 命名空间 ${group.name}`" @click="toggleNamespace(group.name)">
          <component :is="expandedNamespaces.has(group.name) ? ChevronDown : ChevronRight" aria-hidden="true" />
          <span class="sd-namespace-summary">
            <span class="sd-namespace-name sd-mono sd-ellipsis" :title="group.name">{{ group.name }}</span>
            <span class="sd-namespace-totals">{{ searchTerm ? `${group.matches.length} / ${group.pods.length}` : group.pods.length }} 个 Pod · CPU {{ resourceNumber.format(group.cpu) }}c · 内存 {{ resourceNumber.format(group.memory) }}G</span>
          </span>
        </SdButton>
        <PodNamespaceTable v-if="expandedNamespaces.has(group.name)" :id="namespaceId(group.name)" :node-name="node.name" :namespace="group.name" :pods="group.matches" :search-term="searchTerm" :sort-by="sortBy" @remove-pod="(id) => $emit('removePod', id)" />
      </div>
    </template>
  </section>
</template>
