<script setup lang="ts">
const systems = [
  { title: '故障诊断', description: '设备与集群运行监控、故障分析和事件管理。', path: '/overview', external: false },
  { title: '智能调度', description: '根据资源可用性调度请求与任务。', path: '/systems/scheduling', external: false },
  { title: '模型推理', description: '云边协同完成多模态推理任务。', path: '/systems/inference', external: false },
  { title: '存算分离', description: '存储与计算协同优化及结果展示。', path: '/systems/storage', external: false },
]
</script>
<template>
  <section>
    <h2>云边端协同的内生智能决策系统</h2>
    <p>连接设备、网络、服务与架构四个研究层面。</p>
    <el-table :data="systems" row-key="path">
      <el-table-column prop="title" label="研究系统" width="160" />
      <el-table-column prop="description" label="研究方向" />
      <el-table-column label="入口" width="140"><template #default="{ row }"><RouterLink :to="row.path">进入系统</RouterLink></template></el-table-column>
    </el-table>
  </section>
</template>
