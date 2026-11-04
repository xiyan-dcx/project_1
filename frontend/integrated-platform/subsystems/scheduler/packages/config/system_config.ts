/**
 * 科研项目总平台统一参数。
 *
 * 各子系统统一从这里 import，不要在业务代码里写死 IP、端口或接口前缀。
 * 需要新增共享参数时在本文件追加，并注明用途和使用方。
 * nginx 无法直接读取本文件，改完 IP 后执行 `pnpm nginx:upstream` 重新生成。
 */

/** 调度引擎（k8s-scheduler-api 代理）所在主机。 */
export const ENGINE_TARGET = '10.166.33.158'

/** 调度引擎代理监听端口。 */
export const ENGINE_PORT = 18080

/** 浏览器侧使用的接口前缀，运行时代码只用这一条，保持同源。 */
export const ENGINE_API_PATH = '/api/k8s'

/** 仅供开发代理与 nginx 生成脚本使用的绝对地址。 */
export const ENGINE_API_BASE = `http://${ENGINE_TARGET}:${ENGINE_PORT}${ENGINE_API_PATH}`

/** 调度展示页在门户下的挂载路径。 */
export const SCHEDULER_DISPLAY_BASE_PATH = '/scheduler/'
