<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Download, Play, RefreshCw, Search, Trash2 } from 'lucide-vue-next'
import { useEventsStore } from '../stores/events'
import { useTasksStore } from '../stores/tasks'
import { errorMessage, requestJson } from '../api/client'
import { formatDate, formatLabel, rootCauseOptions } from '../api/labels'
import { downloadEventsCsv } from '../api/csv'
import type { EventRecord } from '../api/types'

const eventsStore = useEventsStore()
const tasks = useTasksStore()
const router = useRouter()
const source = ref('')
const category = ref('')
const selectedRecords = ref<EventRecord[]>([])
const busy = ref(false)
const filteredEvents = computed(() => eventsStore.events.filter((record) =>
  (!source.value || record.source === source.value) && (!category.value || record.root_cause_category === category.value)))
const taskCandidates = computed(() => selectedRecords.value.length ? selectedRecords.value
  : eventsStore.events.filter((record) => record.record_id === eventsStore.selectedRecordId))
const canRun = computed(() => taskCandidates.value.length > 0 && taskCandidates.value.every((record) => record.capabilities.diagnose))

watch(() => eventsStore.events, () => { selectedRecords.value = [] })
onMounted(() => { void eventsStore.loadEvents() })

async function confirmAction(message: string, title: string): Promise<boolean> {
  try { await ElMessageBox.confirm(message, title, { confirmButtonText: '确认', cancelButtonText: '取消', type: 'warning' }); return true }
  catch { return false }
}

async function removeRecord(record: EventRecord) {
  if (!record.capabilities.delete || busy.value || tasks.running) return
  if (!await confirmAction(`删除 ${record.event_id} 的普通诊断产物？原始日志和实验结果不会删除，此操作不可撤销。`, '删除诊断结果')) return
  busy.value = true
  try {
    await requestJson(`/api/event/${encodeURIComponent(record.event_id)}`, { method: 'DELETE' })
    ElMessage.success('诊断产物已删除')
    await eventsStore.loadEvents()
  } catch (reason) { ElMessage.error(errorMessage(reason)) }
  finally { busy.value = false }
}

async function clearEvents() {
  if (!await confirmAction('清空所有普通诊断产物及其中间结果？保留原始日志和 stage2 实验结果。此操作不可撤销。', '清空普通诊断产物')) return
  busy.value = true
  try {
    await requestJson('/api/events', { method: 'DELETE' })
    ElMessage.success('普通诊断产物已清空')
    await eventsStore.loadEvents()
  } catch (reason) { ElMessage.error(errorMessage(reason)) }
  finally { busy.value = false }
}

async function runSelected() {
  if (!canRun.value) return
  const identifiers = [...new Set(taskCandidates.value.map((record) => record.event_id))]
  if (!await confirmAction(`重新诊断 ${identifiers.length} 个事件将覆盖对应普通结果，并调用当前配置的模型，可能产生费用。是否继续？`, '批量诊断')) return
  try { await tasks.startDiagnosis(identifiers) }
  catch (reason) { ElMessage.error(errorMessage(reason)) }
}

async function scanLogs() {
  busy.value = true
  try {
    const result = await requestJson<{ new_events: string[]; total_events: number }>('/api/scan-new-logs', {
      method: 'POST', body: JSON.stringify({ log_path: 'data/raw/dbsLogs' }),
    })
    if (!result.new_events.length) { ElMessage.info(`已扫描 ${result.total_events} 个日志目录，没有新事件`); return }
    if (await confirmAction(`发现 ${result.new_events.length} 个新事件：${result.new_events.join('、')}。是否全部诊断？将调用模型，可能产生费用。`, '发现新日志')) {
      await tasks.startDiagnosis(result.new_events)
    }
  } catch (reason) { ElMessage.error(errorMessage(reason)) }
  finally { busy.value = false }
}

function viewRecord(record: EventRecord) {
  eventsStore.selectedRecordId = record.record_id
  void router.push({ name: 'diagnosis', params: { recordId: record.record_id } })
}
</script>

<template>
  <section class="events-page" aria-label="事件管理">
    <header data-visual-region="page-heading" class="event-toolbar">
      <p class="page-lead">管理诊断结果，扫描日志目录并发起多阶段诊断任务。</p>
      <div class="toolbar-actions">
        <el-button :loading="busy" :disabled="tasks.running || tasks.starting" @click="scanLogs">
          <Search :size="15" aria-hidden="true" />扫描新日志
        </el-button>
        <el-button type="primary" :loading="tasks.starting" :disabled="!canRun || busy || tasks.running" @click="runSelected">
          <Play :size="15" aria-hidden="true" />批量诊断
        </el-button>
      </div>
    </header>

    <div data-visual-region="page-content" class="events-content">
      <p v-if="eventsStore.error" class="inline-error" role="alert">
        {{ eventsStore.error }}
        <button type="button" class="text-button" @click="eventsStore.loadEvents">重试</button>
      </p>

      <details v-if="eventsStore.warnings.length" class="catalog-warnings">
        <summary class="tabular-nums">部分结果未能读取（{{ eventsStore.warnings.length }}）</summary>
        <p v-for="warning in eventsStore.warnings" :key="warning">{{ warning }}</p>
      </details>

      <div data-visual-region="data-table" class="events-table-card">
        <div class="toolbar filters-toolbar">
          <div class="filter-fields">
            <label>
              <span>事件来源</span>
              <el-select v-model="source" aria-label="事件来源" placeholder="全部来源" clearable>
                <el-option label="真实事件" value="real" />
                <el-option label="模拟事件" value="mock" />
                <el-option label="未知来源" value="unknown" />
              </el-select>
            </label>
            <label>
              <span>根因类别</span>
              <el-select v-model="category" aria-label="根因类别" placeholder="全部类别" clearable>
                <el-option v-for="option in rootCauseOptions" :key="option.value" :label="option.label" :value="option.value" />
              </el-select>
            </label>
          </div>
          <div class="toolbar-actions">
            <el-button :loading="eventsStore.loading" @click="eventsStore.loadEvents">
              <RefreshCw :size="14" aria-hidden="true" />刷新
            </el-button>
            <el-button :disabled="!eventsStore.events.length" @click="downloadEventsCsv(eventsStore.events)">
              <Download :size="14" aria-hidden="true" />导出全部 CSV
            </el-button>
            <el-button :disabled="busy || tasks.running || !eventsStore.events.some(record => record.capabilities.delete)" @click="clearEvents">
              <Trash2 :size="14" aria-hidden="true" />清空普通产物
            </el-button>
          </div>
        </div>

        <div class="table-caption-bar tabular-nums">
          <span data-slot="badge" data-variant="outline">显示 {{ filteredEvents.length }} 条 · 已选 {{ selectedRecords.length }} 条</span>
          <span class="caption-note">实验结果只读；批量诊断仅支持有原始日志的普通事件。未勾选时使用诊断页选中的事件。</span>
        </div>

        <div class="el-table-surface" data-slot="table-container">
          <el-table
            :data="filteredEvents"
            row-key="record_id"
            :aria-busy="eventsStore.loading"
            empty-text="暂无诊断结果，可扫描新日志或调整筛选条件"
            @selection-change="(records: EventRecord[]) => selectedRecords = records"
          >
            <el-table-column type="selection" width="46" />
            <el-table-column label="事件" min-width="250">
              <template #default="{ row }">
                <button type="button" class="event-link text-button monospace" @click="viewRecord(row)">{{ row.event_id }}</button>
                <div v-if="row.run_id" class="muted run-label monospace">{{ row.suite }} / {{ row.run_id }}</div>
              </template>
            </el-table-column>
            <el-table-column label="来源" width="108">
              <template #default="{ row }">
                <span data-slot="badge" data-variant="outline">{{ formatLabel(row.source) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="主故障主机" min-width="136">
              <template #default="{ row }">
                <span class="monospace tabular-nums">{{ row.primary_failed_host || '—' }}</span>
              </template>
            </el-table-column>
            <el-table-column label="根因类别" min-width="175">
              <template #default="{ row }">
                <span class="category-cell">{{ formatLabel(row.root_cause_category) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="置信度" width="94">
              <template #default="{ row }">
                <span data-slot="badge">{{ formatLabel(row.confidence) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="诊断时间" min-width="170">
              <template #default="{ row }">
                <span class="muted tabular-nums">{{ formatDate(row.generated_at) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="132">
              <template #default="{ row }">
                <el-button link @click="viewRecord(row)">查看</el-button>
                <el-button
                  link
                  :disabled="!row.capabilities.delete || busy || tasks.running"
                  :title="row.capabilities.delete ? '删除普通产物' : '实验结果只读'"
                  @click="removeRecord(row)"
                >
                  删除
                </el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.events-page {
  min-width: 0;
}

.event-toolbar {
  align-items: center;
}

.page-lead {
  margin: 0;
  color: var(--muted-foreground);
  font-size: 0.8125rem;
  line-height: 1.65;
}

.events-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.catalog-warnings {
  padding: 10px 14px;
  border-radius: var(--radius-element);
  background: var(--rainflow-surface);
  box-shadow: inset 0 0 0 1px var(--rainflow-divider);
  font-size: 0.75rem;
  color: var(--muted-foreground);
}

.catalog-warnings summary {
  cursor: pointer;
  font-weight: 500;
  color: var(--foreground);
}

.events-table-card {
  overflow: hidden;
}

.filters-toolbar {
  padding: 16px 20px 14px;
  border-bottom: 1px solid var(--rainflow-divider);
}

.filter-fields {
  display: flex;
  gap: 12px 16px;
  flex-wrap: wrap;
  align-items: center;
}

.filter-fields label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--muted-foreground);
  font-size: 0.78125rem;
  font-weight: 500;
}

.filter-fields .el-select {
  width: 184px;
}

.table-caption-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  padding: 10px 20px;
  border-bottom: 1px solid var(--rainflow-divider);
  font-size: 0.75rem;
  color: var(--muted-foreground);
}

.caption-note {
  line-height: 1.5;
}

.el-table-surface {
  background: var(--rainflow-surface-inset);
}

.el-table-surface :deep(.el-table) {
  border-radius: 0;
}

.event-link {
  text-align: left;
  font-size: 0.8125rem;
  overflow-wrap: anywhere;
}

.run-label {
  font-size: 0.6875rem;
  margin-top: 3px;
  overflow-wrap: anywhere;
}

.category-cell {
  font-weight: 500;
}

@media (max-width: 640px) {
  .filter-fields,
  .filter-fields label,
  .filter-fields .el-select {
    width: 100%;
  }

  .filter-fields label {
    display: grid;
    gap: 6px;
  }
}
</style>
