// Shared presentation shell; never starts or submits business tasks.
(() => {
  const key = 'snowapi-portal-theme'
  const sun = '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>'
  const moon = '<path d="M20 15A8.5 8.5 0 019 4a8.5 8.5 0 1011 11z"/>'
  function apply(dark) {
    document.documentElement.classList.toggle('dark', dark)
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
    document.querySelectorAll('[data-portal-theme]').forEach(button => {
      button.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">${dark ? sun : moon}</svg><span>${dark ? '浅色' : '深色'}</span>`
      button.setAttribute('aria-label', dark ? '切换为浅色模式' : '切换为深色模式')
      button.setAttribute('title', button.getAttribute('aria-label'))
    })
    window.dispatchEvent(new CustomEvent('portal-theme-change', { detail: dark }))
  }
  function saved() { try { return localStorage.getItem(key) === 'dark' } catch { return false } }
  document.addEventListener('click', event => {
    if (!(event.target instanceof Element)) return
    if (event.target.closest('[data-portal-theme]')) {
      const dark = !document.documentElement.classList.contains('dark')
      try { localStorage.setItem(key, dark ? 'dark' : 'light') } catch { /* Optional persistence. */ }
      apply(dark)
    }
    if (event.target.closest('[data-portal-menu]')) {
      const shell = document.querySelector('.portal-frame')
      shell?.classList.toggle('menu-open')
      event.target.closest('button')?.setAttribute('aria-expanded', String(shell?.classList.contains('menu-open')))
    }
  })
  window.addEventListener('storage', event => { if (event.key === key) apply(saved()) })
  const path = location.pathname
  const storage = path.startsWith('/system-3/')
  let syncNavigation = () => {}
  const title = storage ? '存算分离' : path.startsWith('/scheduler/') ? '智能调度' : path.startsWith('/inference/') ? '模型推理' : ''
  const descriptions = {
    '智能调度': '集群资源感知与任务调度过程展示',
    '模型推理': '云边协同视频理解与推理结果展示',
    '整套系统对照': '基线与存算协同方案的性能对照',
    '组件与消融实验': '各组件贡献与优化效果对比',
    '块存储诊断': '存储引擎状态与性能指标分析',
  }
  if (title) {
    const menus = storage ? [['/system-3/benchmark','整套系统对照'],['/system-3/diagnostics/compaction','组件与消融实验'],['/system-3/diagnostics/engines','块存储诊断']] : []
    const active = menus.find(([url]) => path === url)
    const frame = document.createElement('div')
    frame.className = 'portal-frame'
    frame.dataset.system = storage ? 'storage' : title === '智能调度' ? 'scheduler' : 'inference'
    frame.innerHTML = `<aside class="portal-sidebar"><div class="portal-brand"><span class="portal-mark">${storage ? 'SF' : title === '智能调度' ? 'SD' : 'AI'}</span><strong>${title}</strong></div>${menus.length ? '<p class="portal-section">控制台导航</p>' : ''}<nav aria-label="子页面导航">${menus.map(([url,label]) => `<a href="${url}" ${path === url ? 'aria-current="page"' : ''}>${label}</a>`).join('')}</nav><footer class="portal-footer"><a href="/platform">← <span>返回首页</span></a><p>${title}子系统</p><small>云边端协同 · 科研成果展示</small></footer></aside><div class="portal-workspace"><header class="portal-topbar"><button class="portal-menu" data-portal-menu aria-label="切换导航" aria-expanded="false">☰</button><h1>${active?.[1] || title}</h1><span class="portal-topbar-description">${title}</span><button class="portal-theme" data-portal-theme aria-label="切换日夜模式"></button></header><div class="portal-body"></div></div>`
    const app = document.getElementById('app')
    const mark = frame.querySelector('.portal-mark')
    if (storage) {
      frame.querySelector('.portal-brand strong').textContent = 'ScalaFusion'
      const icons = ['<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>','<path d="M4 20V10m8 10V4m8 16v-7M2 20h20"/>','<rect x="3" y="4" width="18" height="6" rx="2"/><rect x="3" y="14" width="18" height="6" rx="2"/><path d="M6 7h.01M6 17h.01M16 7h2m-2 10h2"/>']
      frame.querySelectorAll('nav a').forEach((link,i) => link.insertAdjacentHTML('afterbegin',`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">${icons[i]}</svg>`))
    } else if (title === '模型推理') {
      mark.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>'
      frame.querySelector('.portal-brand strong').textContent = '视频理解协作系统'
    } else {
      mark.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="5" height="5" rx="1.3"/><rect x="16" y="16" width="5" height="5" rx="1.3"/><path d="M8 5.5h8a3 3 0 010 6H8a3 3 0 000 6h8M13 15l3 2.5-3 2.5"/></svg>'
      frame.querySelector('.portal-brand strong').textContent = 'HYBRID SCHEDULER'
    }
    // Match the browser-tab icon to the subsystem identity shown in the sidebar.
    const logo = mark.querySelector('svg')
    const artwork = logo
      ? `<g transform="translate(6 6) scale(.8333)" fill="none" stroke="white" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${logo.innerHTML}</g>`
      : '<text x="16" y="20" text-anchor="middle" fill="white" font-family="Arial,sans-serif" font-size="12" font-weight="600">SF</text>'
    const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#171717"/>${artwork}</svg>`
    document.querySelectorAll('link[rel="icon"]').forEach(icon => icon.remove())
    const favicon = document.createElement('link')
    favicon.rel = 'icon'
    favicon.type = 'image/svg+xml'
    favicon.href = `data:image/svg+xml,${encodeURIComponent(faviconSvg)}`
    document.head.append(favicon)
    const badge = document.createElement('span')
    badge.className = 'portal-system-badge'
    badge.textContent = storage ? 'System 03' : title === '智能调度' ? 'System 02' : 'System 04'
    frame.querySelector('[data-portal-theme]').before(badge)
    frame.querySelector('.portal-topbar-description').textContent = descriptions[active?.[1] || title] || ''
    app.before(frame)
    frame.querySelector('.portal-body').append(app)
    if (storage) {
      syncNavigation = () => {
        const current = menus.find(([url]) => location.pathname.replace(/\/$/, '') === url)
        const heading = frame.querySelector('.portal-topbar h1')
        const label = current?.[1] || title
        if (heading.textContent !== label) heading.textContent = label
        const description = frame.querySelector('.portal-topbar-description')
        const text = descriptions[label] || ''
        if (description.textContent !== text) description.textContent = text
        frame.querySelectorAll('nav a').forEach(link => {
          const selected = link.getAttribute('href') === current?.[0]
          if (selected && link.getAttribute('aria-current') !== 'page') link.setAttribute('aria-current', 'page')
          if (!selected && link.hasAttribute('aria-current')) link.removeAttribute('aria-current')
        })
      }
      window.addEventListener('popstate', syncNavigation)
      syncNavigation()
    }
  }
  apply(saved())
  // Vue may mount the OMS theme button after this script runs.
  const observer = new MutationObserver(() => {
    syncNavigation()
    if ([...document.querySelectorAll('[data-portal-theme]')].some(b => !b.querySelector('svg'))) apply(document.documentElement.classList.contains('dark'))
  })
  observer.observe(document.body, {childList:true, subtree:true})
})()
