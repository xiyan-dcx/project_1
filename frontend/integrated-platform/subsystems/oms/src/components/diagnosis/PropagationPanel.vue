<script setup lang="ts">
import type { DiagnosisDetail } from '../../api/diagnosis'
import FindingsList from './FindingsList.vue'

const props = defineProps<{ diagnosis: DiagnosisDetail }>()
</script>

<template>
  <div class="propagation-container">
    <section>
      <h3>故障传播与证据</h3>
      <p class="note">按模型输出顺序展示推断的传播阶段。这不是实际网络连接图，也不据此补全拓扑边。</p>
      <FindingsList :findings="props.diagnosis.propagation" empty-text="未提供故障传播阶段，无法确认传播链。" />
    </section>
    <section class="causes">
      <h3>候选根因</h3>
      <FindingsList :findings="props.diagnosis.causes" empty-text="暂无候选根因。" />
    </section>
  </div>
</template>

<style scoped>
.propagation-container {
  max-width: 920px;
}

h3 {
  font-size: 0.9375rem;
  margin: 0 0 8px;
  font-weight: 500;
}

.note {
  color: var(--muted-foreground);
  font-size: 0.78125rem;
  line-height: 1.7;
  margin: 0 0 14px;
}

.causes {
  margin-top: 28px;
}
</style>
