<script setup lang="ts">
withDefaults(defineProps<{
  variant?: 'default' | 'secondary' | 'ghost' | 'destructive'
  size?: 'default' | 'sm' | 'icon'
  disabled?: boolean
}>(), { variant: 'default', size: 'default', disabled: false })
</script>

<template>
  <button type="button" class="sd-button" data-slot="button" :data-variant="variant" :data-size="size" :disabled="disabled">
    <slot />
  </button>
</template>
