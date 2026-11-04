<script setup lang="ts">
withDefaults(defineProps<{ bodyClass?: string }>(), { bodyClass: '' })
</script>

<template>
  <section class="sd-panel" data-slot="card">
    <header v-if="$slots.title" class="sd-panel-header" data-slot="card-header">
      <div class="sd-min-w-0">
        <h2 class="sd-panel-title" data-slot="card-title"><slot name="title" /></h2>
        <p v-if="$slots.description" class="sd-panel-description" data-slot="card-description"><slot name="description" /></p>
      </div>
      <div v-if="$slots.actions" class="sd-panel-actions" data-slot="card-action"><slot name="actions" /></div>
    </header>
    <div v-if="$slots.toolbar" class="sd-panel-toolbar"><slot name="toolbar" /></div>
    <div class="sd-panel-body" :class="bodyClass" data-slot="card-content"><slot /></div>
    <footer v-if="$slots.footer" class="sd-panel-footer" data-slot="card-footer"><slot name="footer" /></footer>
  </section>
</template>
