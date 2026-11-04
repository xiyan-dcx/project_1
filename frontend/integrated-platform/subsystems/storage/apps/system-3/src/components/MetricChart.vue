<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { themedChart } from '@research-platform/design-system/charts'
import { themeRevision } from '@research-platform/design-system/theme'
import { init, use, type ECharts } from 'echarts/core'
import type { EChartsOption } from '../domain/dashboard'
import { BarChart, LineChart, PieChart, RadarChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
use([BarChart, LineChart, PieChart, RadarChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer])
const props = defineProps<{ option: EChartsOption; label: string; tall?: boolean }>()
const host = ref<HTMLDivElement>()
let chart: ECharts | undefined
let observer: ResizeObserver | undefined
onMounted(() => {
  chart = init(host.value!)
  chart.setOption(themedChart(props.option))
  observer = new ResizeObserver(() => chart?.resize())
  observer.observe(host.value!)
})
watch(() => props.option, option => chart?.setOption(themedChart(option), true), {deep: true})
watch(themeRevision,()=>chart?.setOption(themedChart(props.option)))
onBeforeUnmount(() => { observer?.disconnect(); chart?.dispose() })
</script>
<template>
  <div ref="host" class="chart-container" :class="{ tall }" role="img" :aria-label="label" />
</template>
