<script setup lang="ts">
import { buttonVariants } from '../variants'
const props = withDefaults(defineProps<{ variant?: 'default'|'secondary'|'outline'|'ghost'|'destructive'; size?: 'xs'|'sm'|'default'|'lg'|'icon'; type?: 'button'|'submit'|'reset' }>(), { variant:'secondary',size:'default',type:'button' })
</script>
<template><button :type="props.type" data-slot="button" :data-variant="props.variant" :data-size="props.size" :class="buttonVariants({variant:props.variant,size:props.size})"><slot /></button></template>
