/** Presentation wording only. Original API responses and evidence stay unchanged. */
export function environmentLabel(value: string | undefined | null): string {
  return (value || '').replace(/FEMU/gi, '测试设备')
}
