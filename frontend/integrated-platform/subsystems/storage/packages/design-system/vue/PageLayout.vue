<script setup lang="ts">
const props=defineProps<{title?:string;description?:string;eyebrow?:string}>();
</script>
<template>
  <main class="ui-page" data-slot="page-layout">
    <slot name="heading"><header data-visual-region="page-heading" class="ui-page-heading"><div><p v-if="props.eyebrow" class="eyebrow">{{props.eyebrow}}</p><h1>{{props.title}}</h1><p v-if="props.description" class="page-description">{{props.description}}</p></div><div v-if="$slots.actions" class="ui-page-actions"><slot name="actions" /></div></header></slot>
    <div data-visual-region="page-content" class="ui-page-content"><slot /></div>
  </main>
</template>
