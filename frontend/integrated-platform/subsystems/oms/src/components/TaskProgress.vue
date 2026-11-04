<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import { Activity, X } from 'lucide-vue-next'
import { useTasksStore } from '../stores/tasks'
import { errorMessage } from '../api/client'
import { formatLabel } from '../api/labels'

const tasks = useTasksStore()

async function confirmStop() {
  try {
    await ElMessageBox.confirm(
      '当前诊断阶段会被立即中断，正在处理的事件不会生成完整报告；已完成诊断的事件结果保留。确认停止？',
      '停止诊断任务',
      { confirmButtonText: '停止任务', cancelButtonText: '继续运行', type: 'warning' },
    )
  } catch { return }
  try { await tasks.stopTask() } catch (reason) { ElMessage.error(errorMessage(reason)) }
}
</script>

<template>
  <section v-if="tasks.visible && tasks.task" class="task-panel" data-slot="card" aria-label="诊断任务">
    <div class="toolbar">
      <div class="task-title-group">
        <span data-slot="icon-badge" class="task-icon" aria-hidden="true">
          <Activity :size="15" :stroke-width="1.75" />
        </span>
        <strong class="task-heading">诊断任务</strong>
        <span data-slot="badge" :data-variant="tasks.running ? 'default' : 'outline'">
          {{ formatLabel(tasks.task.status) }}
        </span>
        <span class="task-percentage tabular-nums">{{ Math.max(0, Math.min(100, tasks.task.progress)) }}%</span>
      </div>
      <div class="toolbar-actions">
        <el-button v-if="tasks.running" size="small" :loading="tasks.stopping" @click="confirmStop">停止任务</el-button>
        <button type="button" class="icon-button" aria-label="收起进度，任务继续运行" @click="tasks.visible = false">
          <X :size="16" aria-hidden="true" />
        </button>
      </div>
    </div>
    <p class="task-panel-message" role="status">{{ tasks.task.message }}</p>
    <el-progress :percentage="Math.max(0, Math.min(100, tasks.task.progress))" :show-text="false" :stroke-width="5" color="var(--primary)" />
    <p v-if="tasks.error" class="error-text" role="alert">连接状态：{{ tasks.error }}。正在尝试恢复。</p>
    <small class="muted">收起面板不会停止任务。服务重启会中断正在运行的任务，历史任务状态会保留。</small>
  </section>
  <p v-else-if="tasks.visible && tasks.error" class="inline-error" role="alert">{{ tasks.error }}</p>
</template>

<style scoped>
.task-title-group {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.task-icon {
  width: 26px;
  height: 26px;
}

.task-heading {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--foreground);
}

.task-percentage {
  font-size: 0.75rem;
  color: var(--muted-foreground);
  margin-left: 2px;
}
</style>
