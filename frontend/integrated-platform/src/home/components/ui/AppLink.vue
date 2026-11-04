<script setup lang="ts">
import { cva } from 'class-variance-authority'
import { cn } from '../../lib/utils'

const props = withDefaults(defineProps<{
  href: string
  variant?: 'default' | 'secondary' | 'ghost'
  size?: 'default' | 'lg'
}>(), { variant: 'default', size: 'default' })

const variants = cva('button', {
  variants: {
    variant: { default: 'button-primary', secondary: 'button-secondary', ghost: 'button-ghost' },
    size: { default: 'button-default', lg: 'button-lg' },
  },
})
</script>

<template>
  <a :href="props.href" :class="cn(variants({ variant: props.variant, size: props.size }))"
    data-slot="button" :data-variant="props.variant" :data-size="props.size">
    <slot />
  </a>
</template>
