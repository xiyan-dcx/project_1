<script setup lang="ts">
import { RouterView } from 'vue-router'
</script>

<template>
  <!--
    Standalone shell only: owns the viewport height. The portal mounts
    SchedulerDisplay.vue directly and provides its own layout.
  -->
  <div class="sd-standalone">
    <RouterView />
  </div>
</template>
