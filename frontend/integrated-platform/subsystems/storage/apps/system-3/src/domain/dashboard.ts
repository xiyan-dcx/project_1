import type { ComposeOption } from 'echarts/core'
import type { BarSeriesOption, LineSeriesOption, PieSeriesOption, RadarSeriesOption } from 'echarts/charts'
import type { GridComponentOption, LegendComponentOption, TooltipComponentOption } from 'echarts/components'
export type EChartsOption = ComposeOption<BarSeriesOption | LineSeriesOption | PieSeriesOption | RadarSeriesOption | GridComponentOption | LegendComponentOption | TooltipComponentOption>
import type { EngineDescriptor, Sample, EngineKey } from '../types/bench'

export function benchmarkAllowed(health: { ok?: unknown; run_enabled?: unknown }): boolean {
  return health.ok === true && health.run_enabled === true
}

const ENGINE_COLORS: Record<string, string> = {
  scalaafa: 'var(--chart-1)',
  mdraid: 'var(--chart-2)',
  raid5f: 'var(--chart-3)',
  dpp: 'var(--chart-4)',
}
export const color = (engine: EngineKey) => ENGINE_COLORS[engine] || 'var(--muted-foreground)'

export function parseEngineCatalog(payload: unknown): EngineDescriptor[] {
  if (!payload || typeof payload !== 'object' || !('engines' in payload) || !Array.isArray(payload.engines)) {
    throw new Error('引擎清单格式错误')
  }
  if (!payload.engines.length) throw new Error('后端未提供可展示的引擎')
  const seen = new Set<string>()
  return payload.engines.map((value): EngineDescriptor => {
    if (!value || typeof value !== 'object') throw new Error('引擎清单包含无效项目')
    const engine = value as Record<string, unknown>
    if (typeof engine.key !== 'string' || !engine.key || typeof engine.name !== 'string' ||
        typeof engine.mode !== 'string' || typeof engine.runnable !== 'boolean' ||
        typeof engine.reason !== 'string' || seen.has(engine.key)) {
      throw new Error('引擎清单字段缺失或重复')
    }
    seen.add(engine.key)
    return { key: engine.key, name: engine.name, mode: engine.mode, runnable: engine.runnable, reason: engine.reason }
  })
}
export const envKey = (s: Pick<Sample, 'rw' | 'bs' | 'qd' | 'rt'>) => [s.rw, s.bs, s.qd, s.rt].join('|')
export const sampleKey = (s: Sample) => s.engine + '|' + envKey(s)
export function upsert(samples: Sample[], sample: Sample): Sample[] {
  const index = samples.findIndex(s => sampleKey(s) === sampleKey(sample))
  if (index < 0) return [...samples, sample]
  return samples.map((s, i) => i === index ? sample : s)
}
export function groupEnvironments(samples: Sample[]) {
  const groups = new Map<string, Sample[]>()
  samples.forEach(s => groups.set(envKey(s), upsert(groups.get(envKey(s)) || [], s)))
  return [...groups].map(([key, rows]) => ({ key, rows, ...(({rw, bs, qd, rt}) => ({rw, bs, qd, rt}))(rows[0]) }))
}
export function percentile(s: Sample, p: number): number | null {
  const entry = Object.entries(s.pct || {}).find(([key]) => Number(key) === p)
  return entry && Number.isFinite(entry[1]) ? entry[1] : null
}
export const format = (value: number | undefined | null, digits = 1) => value == null ? '—' : value.toFixed(digits)
const positive = (value: number | undefined | null) => value != null && value > 0 ? value : null

// Match the original five-axis formula for known values. Missing values remain missing.
export function radarScores(s: Sample, rows: Sample[]) {
  const max = (f: (r: Sample) => number | null | undefined) => Math.max(...rows.map(r => f(r) ?? 0)) || 1
  const inverse = (v: number | null | undefined, m: number) => v == null ? null : Math.round(100 - v / m * 100)
  return [Math.round(s.iops / max(r => r.iops) * 100), Math.round(s.bw_mib / max(r => r.bw_mib) * 100),
    inverse(s.lat_us, max(r => r.lat_us)), inverse(s.lat_stdev, max(r => r.lat_stdev)), inverse(s.cpu?.usr, max(r => r.cpu?.usr))]
}

export const CHARTS = [
  { key: 'iops', title: 'IOPS 对比', subtitle: '每秒IO数', col: 4 },
  { key: 'bw', title: '带宽对比', subtitle: 'MiB/s', col: 4 },
  { key: 'lat', title: '平均延迟', subtitle: 'µs (越低越好)', col: 4 },
  { key: 'radar', title: '多维性能雷达', subtitle: '五维综合对比', col: 6, tall: true },
  { key: 'pct', title: '延迟长尾分布', subtitle: '百分位 (对数轴)', col: 6, tall: true },
  { key: 'latDist', title: '延迟区间分布', subtitle: 'IO 在各延迟桶的占比', col: 6 },
  { key: 'cpu', title: 'CPU 占用', subtitle: '%', col: 3 },
  { key: 'depth', title: 'IO 深度分布', subtitle: '实际深度占比', col: 3 },
  { key: 'latStats', title: '延迟统计 (min/avg/max)', subtitle: 'µs (对数轴)', col: 6 },
  { key: 'stability', title: '性能稳定性', subtitle: 'IOPS 标准差 (越低越稳)', col: 6 },
] as const
export type ChartKey = typeof CHARTS[number]['key']
const grid = { left: 12, right: 16, top: 44, bottom: 18, containLabel: true }
const textStyle = { color: 'var(--muted-foreground)', fontSize: 10, fontFamily: 'Monaco, monospace' }
const legend = { top: 0, textStyle, itemWidth: 10, itemHeight: 8 }
const yAxis = { type: 'value' as const, axisLabel: textStyle, splitLine: { lineStyle: { color: 'var(--rainflow-divider)' } } }
const tooltip = { trigger: 'axis' as const, confine: true, backgroundColor: 'var(--muted-foreground)', borderColor: 'var(--muted-foreground)', textStyle: { color: 'var(--muted-foreground)' } }
export function chartOptions(key: ChartKey, rows: Sample[]): EChartsOption {
  const names = rows.map(s => s.engine_name)
  const xAxis = { type: 'category' as const, data: names, axisLabel: { ...textStyle, interval: 0 }, axisLine: { lineStyle: { color: 'var(--muted-foreground)' } } }
  const base = { textStyle, tooltip, grid, xAxis, yAxis }
  const bar = (values: (number | null | undefined)[]): EChartsOption => ({ ...base, series: [{ type: 'bar', barMaxWidth: 70,
    data: values.map((value, i) => ({ value: value ?? null, itemStyle: { color: color(rows[i].engine), borderColor: color(rows[i].engine), borderWidth: 2, borderRadius: [8, 8, 0, 0] } })) }] })
  if (key === 'iops') return bar(rows.map(s => s.iops))
  if (key === 'bw') return bar(rows.map(s => s.bw_mib))
  if (key === 'lat') return bar(rows.map(s => s.lat_us))
  if (key === 'stability') return bar(rows.map(s => s.iops_stat?.stdev))
  if (key === 'radar') return { textStyle, tooltip: { ...tooltip, trigger: 'item' }, legend: { ...legend, top: undefined, bottom: 0 },
    radar: { center: ['50%', '46%'], radius: '62%', indicator: ['IOPS','带宽','低延迟','稳定性','低CPU'].map(name => ({name, max: 100})),
      axisName: { color: 'var(--muted-foreground)' }, splitArea: { areaStyle: {color: ['var(--muted-foreground)','var(--muted-foreground)']} }, splitLine: {lineStyle: {color: 'var(--muted-foreground)'}} },
    series: [{ type: 'radar', data: rows.map(s => ({ name: s.engine_name, value: radarScores(s, rows),
      lineStyle: {color: color(s.engine), width: 2}, itemStyle: {color: color(s.engine)}, areaStyle: {color: color(s.engine)} })) }] }
  if (key === 'pct') {
    const ps = [1,5,10,20,30,40,50,60,70,80,90,95,99,99.5,99.9,99.95,99.99]
    return { ...base, legend, xAxis: {...xAxis, data: ps.map(String), axisLabel: textStyle}, yAxis: {...yAxis, type: 'log', name: '延迟 µs'},
      series: rows.map(s => ({name: s.engine_name, type: 'line', smooth: .3, connectNulls: true, symbolSize: 6,
        data: ps.map(p => positive(percentile(s, p))), itemStyle: {color: color(s.engine)}})) }
  }
  if (key === 'latDist') {
    const toUs = (b: string) => parseFloat(b) * (b.includes('msec') ? 1000 : 1)
    const buckets = [...new Set(rows.flatMap(s => Object.keys(s.lat_dist || {})))].sort((a,b) => toUs(a) - toUs(b))
    return {...base, legend, xAxis: {...xAxis, data: buckets, axisLabel: textStyle}, yAxis: {...yAxis, max: 100},
      series: rows.map(s => ({name: s.engine_name, type: 'bar', data: buckets.map(b => s.lat_dist?.[b] ?? 0),
        itemStyle: {color: color(s.engine), borderColor: color(s.engine), borderWidth: 2, borderRadius: [4,4,0,0]}}))}
  }
  if (key === 'cpu') return {...base, legend: {...legend, top: undefined, bottom: 0}, grid: {...grid, bottom: 32}, yAxis: {...yAxis, max: 100},
    series: ([['usr','用户','var(--chart-1)b3'], ['sys','系统','var(--chart-3)b3'], ['idle','空闲','var(--chart-2)4d']] as const).map(([field,name,c]) => ({
      name, type: 'bar', stack: 'cpu', data: rows.map(s => s.cpu?.[field] ?? null), itemStyle: {color: c}})) }
  if (key === 'depth') return {textStyle, tooltip: {...tooltip, trigger: 'item'}, legend: {...legend, orient: 'vertical', top: 'center', right: 0},
    series: [{type: 'pie', radius: ['40%','68%'], center: ['35%','50%'], label: {show: false},
      data: Object.entries(rows[0]?.io_depths || {}).filter(([,v]) => v > 0).map(([k,v], i) => ({name: 'd='+k, value: v,
        itemStyle: {color: ['var(--chart-1)','var(--chart-4)','var(--muted-foreground)','var(--chart-3)','var(--chart-2)','var(--muted-foreground)','var(--muted-foreground)'][i % 7]}}))}]}
  return {...base, legend, yAxis: {...yAxis, type: 'log'},
    series: ([['lat_min','Min','var(--chart-2)99'],['lat_us','Avg','var(--chart-1)99'],['lat_max','Max','var(--muted-foreground)']] as const).map(([field,name,c]) => ({
      name, type: 'bar', data: rows.map(s => positive(s[field])), itemStyle: {color: c, borderRadius: [4,4,0,0]}}))}
}
export type Point = {t: number; iops: number; bw_mib: number}
export function streamOptions(points: Point[], engine: EngineKey): EChartsOption {
  return {textStyle, tooltip, legend, grid: {...grid, left: 22, right: 26},
    xAxis: {type: 'category', data: points.map(p => p.t+'s'), axisLabel: textStyle},
    yAxis: [{...yAxis, name: 'IOPS'}, {...yAxis, name: 'MiB/s', position: 'right', splitLine: {show: false}}],
    series: [{name: 'IOPS', type: 'line', smooth: .3, showSymbol: false, data: points.map(p => p.iops), itemStyle: {color: color(engine)}, areaStyle: {color: color(engine)}},
      {name: '带宽 MiB/s', type: 'line', smooth: .3, showSymbol: false, yAxisIndex: 1, data: points.map(p => p.bw_mib), itemStyle: {color: 'var(--muted-foreground)'}}]}
}
