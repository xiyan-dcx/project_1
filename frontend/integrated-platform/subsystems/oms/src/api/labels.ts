const labels: Record<string, string> = {
  real: '真实事件', mock: '模拟事件', unknown: '未知',
  critical: '严重', high: '高', medium: '中', low: '低',
  normal: '正常', healthy: '正常', none: '无',
  queued: '等待启动', running: '运行中', completed: '已完成', failed: '失败', stopped: '已停止',
  open: '待处置', acknowledged: '处置中', resolved: '已恢复',
  host_shutdown_or_poweroff: '主机关机或掉电',
  host_network_partition_or_isolation: '主机网络隔离',
  service_process_failure: '服务进程故障',
  storage_or_disk_failure: '存储或磁盘故障',
  config_or_env_misconfig: '配置或环境错误',
}

export function formatLabel(value: unknown): string {
  if (value === null || value === undefined || value === '') return '未提供'
  const text = String(value)
  return labels[text.toLowerCase()] ?? text
}

export function formatDate(value: string): string {
  if (!value) return '未提供'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false })
}

export const rootCauseOptions = Object.entries(labels)
  .filter(([value]) => ['host_shutdown_or_poweroff', 'host_network_partition_or_isolation',
    'service_process_failure', 'storage_or_disk_failure', 'config_or_env_misconfig'].includes(value))
  .map(([value, label]) => ({ value, label }))
