// 端口仍是本系统本地常量，待总平台统一配置后只改这一处。
export const API_PORT_LOCAL = 8000
const moduleBase = import.meta.env.BASE_URL.replace(/\/$/, '')
export const apiBase = import.meta.env.VITE_API_BASE || `${moduleBase}/api`
export const wsBase = import.meta.env.VITE_WS_BASE || `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}${moduleBase}/ws`
