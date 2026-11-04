<script setup lang="ts">
const props = defineProps<{ evidence: string[] }>()
</script>

<template>
  <details v-if="props.evidence.length" class="evidence">
    <summary class="tabular-nums">证据引用 · {{ props.evidence.length }} 条</summary>
    <ul>
      <li v-for="(entry, index) in props.evidence" :key="index"><pre>{{ entry }}</pre></li>
    </ul>
  </details>
</template>

<style scoped>
.evidence {
  margin-top: 12px;
  color: var(--muted-foreground);
  font-size: 0.75rem;
  background: var(--rainflow-surface);
  border-radius: var(--radius-element);
  box-shadow: inset 0 0 0 1px var(--rainflow-divider);
  padding: 8px 12px;
}

summary {
  cursor: pointer;
  padding: 2px 0;
  font-weight: 500;
  color: var(--foreground);
}

ul {
  list-style: none;
  padding: 0;
  margin: 10px 0 0;
}

li + li {
  margin-top: 8px;
  border-top: 1px solid var(--rainflow-divider);
  padding-top: 8px;
}

pre {
  margin: 0;
  font-size: 0.71875rem;
  line-height: 1.65;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  color: var(--foreground);
}
</style>
