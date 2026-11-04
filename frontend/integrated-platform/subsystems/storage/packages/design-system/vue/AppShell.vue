<template>
  <div class="snow-shell" data-slot="app-shell">
    <a class="skip-link" href="#workspace-content">跳转到主内容</a>
    <aside class="snow-sidebar" aria-label="工作区导航"><slot name="brand" /><div class="sidebar-content"><slot name="navigation" /></div><div class="sidebar-footer"><slot name="footer" /></div></aside>
    <div class="snow-workspace" data-slot="sidebar-inset"><header class="snow-topbar"><slot name="header" /></header><div id="workspace-content" class="snow-content" tabindex="-1"><slot /></div></div>
  </div>
</template>
