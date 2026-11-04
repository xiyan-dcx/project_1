<script setup lang="ts">
defineProps<{ title: string; description?: string }>()
</script>

<template>
  <div class="sd-empty" data-slot="empty-state" role="status">
    <span v-if="$slots.icon" class="sd-empty-icon" aria-hidden="true"><slot name="icon" /></span>
    <p class="sd-empty-title">{{ title }}</p>
    <p v-if="description" class="sd-empty-description">{{ description }}</p>
  </div>
</template>
