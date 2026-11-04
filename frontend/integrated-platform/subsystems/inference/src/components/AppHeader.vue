<template>
  <header class="app-header">
    <div class="logo-mark" aria-hidden="true">
      <svg viewBox="0 0 24 24"><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" /></svg>
    </div>
    <div>
      <div class="header-title">视频理解协作系统</div>
      <div class="header-subtitle">云边协同 · 多模态推理</div>
    </div>
  </header>
</template>

<style scoped>
.app-header { position: sticky; top: 0; z-index: 20; height: var(--header-height); padding: 0 24px; display: flex; align-items: center; gap: 10px; border-bottom: 1px solid var(--border); background: rgb(255 255 255 / 92%); backdrop-filter: blur(8px); }
.logo-mark { width: 28px; height: 28px; display: grid; place-items: center; flex: 0 0 auto; border-radius: 6px; background: var(--primary); }
.logo-mark svg { width: 14px; height: 14px; fill: none; stroke: var(--primary-foreground); stroke-width: 2; }
.header-title { font-size: 14px; font-weight: 600; }
.header-subtitle { margin-top: 1px; color: var(--muted-foreground); font-size: 11px; }
</style>
