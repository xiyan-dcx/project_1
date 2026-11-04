<script setup lang="ts">
withDefaults(defineProps<{ tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'cpu' | 'memory' }>(), { tone: 'neutral' })
</script>

<template>
  <span class="sd-badge" data-slot="badge" :data-tone="tone"><slot /></span>
</template>
