<script setup lang="ts">
const props = withDefaults(defineProps<{size?:'default'|'sm'}>(),{size:'default'});
</script>
<template><article data-slot="card" :data-size="props.size" class="ui-card"><slot /></article></template>
