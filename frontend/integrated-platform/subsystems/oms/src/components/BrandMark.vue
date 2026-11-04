<script setup lang="ts">
const props = withDefaults(defineProps<{ size?: number }>(), { size: 18 })
</script>

<template>
  <!-- Four quadrants, the top-right one slipped upward: one host cut off from the cluster. -->
  <svg
    class="brand-mark-icon"
    xmlns="http://www.w3.org/2000/svg"
    :width="props.size"
    :height="props.size"
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
    focusable="false"
  >
    <path d="M10.7 12.45H3.25A7.45 7.45 0 0 1 10.7 5ZM13.3 8.95V1.5A7.45 7.45 0 0 1 20.75 8.95ZM13.3 15.05H20.75A7.45 7.45 0 0 1 13.3 22.5ZM10.7 15.05V22.5A7.45 7.45 0 0 1 3.25 15.05Z" />
  </svg>
</template>

<style scoped>
.brand-mark-icon {
  display: block;
  flex: none;
}
</style>
