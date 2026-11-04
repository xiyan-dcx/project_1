export async function consumeSse<T>(
  response: Response,
  onEvent: (event: T) => void | Promise<void>,
): Promise<void> {
  if (!response.ok) {
    throw new Error((await response.text()) || `请求失败：HTTP ${response.status}`)
  }
  if (!response.body) throw new Error('浏览器未收到流式响应体')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  const processBlocks = async (flush = false) => {
    const blocks = buffer.split(/\r?\n\r?\n/)
    buffer = flush ? '' : (blocks.pop() ?? '')
    for (const block of blocks) {
      const payload = block
        .split(/\r?\n/)
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n')
      if (payload) await onEvent(JSON.parse(payload) as T)
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    await processBlocks()
  }
  buffer += decoder.decode()
  if (buffer.trim()) {
    buffer += '\n\n'
    await processBlocks(true)
  }
}
