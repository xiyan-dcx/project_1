<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

const props = defineProps<{ modelValue: string[]; options: string[]; loading?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: string[]] }>()
const open = ref(false)
const root = ref<HTMLElement | null>(null)
const label = computed(() => props.modelValue.length ? `已选 ${props.modelValue.length} 个视频` : '— 不附带视频（纯文本模式）—')

function toggleVideo(video: string) {
  emit('update:modelValue', props.modelValue.includes(video)
    ? props.modelValue.filter((item) => item !== video)
    : [...props.modelValue, video])
}
function outside(event: MouseEvent) {
  if (root.value && !root.value.contains(event.target as Node)) open.value = false
}
onMounted(() => document.addEventListener('click', outside))
onBeforeUnmount(() => document.removeEventListener('click', outside))
</script>

<template>
  <div ref="root" class="video-select">
    <button class="trigger" type="button" :aria-expanded="open" @click.stop="open = !open">
      <span>{{ loading ? '正在加载视频…' : label }}</span>
      <svg :class="{ rotated: open }" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9" /></svg>
    </button>
    <div v-if="open" class="panel">
      <label v-for="video in options" :key="video" class="option">
        <input type="checkbox" :checked="modelValue.includes(video)" @change="toggleVideo(video)" />
        <span>{{ video }}</span>
      </label>
      <div v-if="!loading && options.length === 0" class="empty">没有可用视频</div>
    </div>
    <div v-if="modelValue.length" class="pills">
      <span v-for="video in modelValue" :key="video" class="pill">
        <span>{{ video }}</span>
        <button type="button" :aria-label="`移除 ${video}`" @click="toggleVideo(video)">×</button>
      </span>
    </div>
  </div>
</template>

<style scoped>
.video-select { position: relative; }
.trigger { width: 100%; height: 36px; padding: 0 11px; display: flex; align-items: center; justify-content: space-between; border: 1px solid var(--border); border-radius: 8px; background: white; color: var(--foreground); font: inherit; font-size: 13px; cursor: pointer; }
.trigger:focus-visible { border-color: #a0a0a0; outline: 3px solid var(--ring); }
.trigger svg { width: 14px; fill: none; stroke: var(--muted-foreground); stroke-width: 2; transition: transform .18s; }
.trigger svg.rotated { transform: rotate(180deg); }
.panel { position: absolute; z-index: 30; top: 40px; right: 0; left: 0; max-height: 220px; padding: 4px 0; overflow-y: auto; border: 1px solid var(--border); border-radius: 8px; background: white; box-shadow: 0 8px 24px rgb(0 0 0 / 10%); }
.option { padding: 7px 12px; display: flex; align-items: center; gap: 9px; font-family: var(--font-mono); font-size: 12px; cursor: pointer; }
.option:hover { background: var(--muted); }
.option input { accent-color: var(--primary); }
.option span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.empty { padding: 16px; color: var(--muted-foreground); text-align: center; font-size: 12px; }
.pills { margin-top: 6px; display: flex; flex-wrap: wrap; gap: 4px; }
.pill { max-width: 210px; padding: 2px 4px 2px 9px; display: inline-flex; align-items: center; gap: 4px; border: 1px solid var(--border); border-radius: 99px; background: var(--muted); font-family: var(--font-mono); font-size: 11px; }
.pill > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pill button { width: 16px; height: 16px; padding: 0; border: 0; border-radius: 50%; background: none; color: var(--muted-foreground); cursor: pointer; }
.pill button:hover { background: var(--border); color: var(--foreground); }
</style>
