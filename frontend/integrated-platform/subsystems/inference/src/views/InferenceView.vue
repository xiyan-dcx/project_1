<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { listVideos } from '@/api/video'
import InputCard from '@/components/InputCard.vue'
import PipelineCard from '@/components/PipelineCard.vue'
import ResultList from '@/components/ResultList.vue'
import { useInference } from '@/composables/useInference'

const videos = ref<string[]>([])
const loadingVideos = ref(true)
const { submitting, results, pipeline, submit } = useInference()

onMounted(async () => {
  try { videos.value = await listVideos() }
  catch (error) { console.error('加载视频列表失败', error) }
  finally { loadingVideos.value = false }
})
</script>

<template>
  <main class="content">
    <InputCard :videos="videos" :loading-videos="loadingVideos" :submitting="submitting" @submit="submit($event.videos, $event.prompt)" />
    <PipelineCard :pipeline="pipeline" />
    <ResultList :results="results" />
  </main>
</template>
