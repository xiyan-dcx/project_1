<script setup lang="ts">
const props = withDefaults(defineProps<{variant?:'default'|'secondary'|'outline'}>(),{variant:'secondary'});
</script>
<template><span data-slot="badge" :data-variant="props.variant" data-size="sm" class="ui-badge"><slot /></span></template>
