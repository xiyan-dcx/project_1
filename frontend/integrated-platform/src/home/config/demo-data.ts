// Static values transcribed from the supplied design reference.
// Replace this configuration with backend responses when endpoints are available.
// No timers, fabricated live updates or network requests run in the demo.
export interface Metric { labelKey: string; value: string; unit?: string }
export const overviewMetrics: Metric[] = [
  { labelKey: 'Online nodes', value: '128' },
  { labelKey: 'Connected devices', value: '2,048' },
  { labelKey: 'Average decision latency', value: '18', unit: 'ms' },
  { labelKey: 'Inference throughput', value: '3,200', unit: 'tok/s' },
]
export const operatingMetrics: Metric[] = [
  ...overviewMetrics.slice(0, 2),
  { labelKey: 'Daily decisions', value: '46.2', unit: '万' },
  overviewMetrics[2]!,
  { labelKey: 'Device computing utilization', value: '74.3', unit: '%' },
  { labelKey: 'System availability', value: '99.98', unit: '%' },
]
export const moduleMetrics: Record<string, Metric[]> = {
  'fault-diagnosis': [{ labelKey: 'Diagnostic accuracy', value: '98.6', unit: '%' }, { labelKey: 'Control latency', value: '12', unit: 'ms' }],
  'intelligent-scheduling': [{ labelKey: 'Scheduling success', value: '99.2', unit: '%' }, { labelKey: 'Average latency', value: '18', unit: 'ms' }],
  'model-inference': [{ labelKey: 'Inference throughput', value: '3.2', unit: 'K tok/s' }, { labelKey: 'Collaboration modes', value: '4', unit: '种' }],
  'storage-compute': [{ labelKey: 'Storage bandwidth', value: '12.4', unit: 'GB/s' }, { labelKey: 'P99 latency', value: '4.1', unit: 'ms' }],
}
export const requestHistory = [20, 24, 22, 32, 28, 38, 34, 44, 40, 49, 45, 55, 52, 60, 65, 72]
export const moduleLayers: Record<string, string> = {
  'fault-diagnosis': 'Device module layer',
  'intelligent-scheduling': 'Network module layer',
  'model-inference': 'Service module layer',
  'storage-compute': 'Architecture module layer',
}
