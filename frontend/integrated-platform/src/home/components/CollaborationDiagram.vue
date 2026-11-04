<script setup lang="ts">
import { IconCloud, IconServer, IconDeviceDesktop, IconCpu, IconArrowsExchange } from '@tabler/icons-vue'
import { useI18n } from 'vue-i18n'
const { t } = useI18n()
</script>

<template>
  <figure class="collaboration-diagram" :aria-label="t('Collaboration diagram')">
    <div class="diagram-grid" aria-hidden="true"></div>
    <div class="diagram-row cloud-row">
      <div class="tier-label"><strong>{{ t('Cloud') }}</strong><span>CLOUD</span></div>
      <div class="diagram-node cloud-node"><IconCloud :size="28" stroke="1.4" aria-hidden="true" /><span>{{ t('Cloud resources') }}</span></div>
      <p class="node-note">{{ t('Collaborative computing') }}</p>
    </div>
    <div class="diagram-connectors" aria-hidden="true"><span></span><span></span><span></span></div>
    <div class="diagram-row edge-row">
      <div class="tier-label"><strong>{{ t('Edge') }}</strong><span>EDGE</span></div>
      <div class="node-group">
        <div v-for="index in 3" :key="index" class="diagram-node edge-node"><IconServer :size="22" stroke="1.4" aria-hidden="true" /></div>
      </div>
      <p class="node-note">{{ t('Local response') }}</p>
    </div>
    <div class="diagram-connectors device-connectors" aria-hidden="true"><span></span><span></span><span></span></div>
    <div class="diagram-row device-row">
      <div class="tier-label"><strong>{{ t('Device') }}</strong><span>DEVICE</span></div>
      <div class="node-group device-group">
        <div class="diagram-node device-node"><IconDeviceDesktop :size="19" stroke="1.4" aria-hidden="true" /></div>
        <div class="diagram-node device-node"><IconCpu :size="19" stroke="1.4" aria-hidden="true" /></div>
        <div class="diagram-node device-node"><IconDeviceDesktop :size="19" stroke="1.4" aria-hidden="true" /></div>
      </div>
      <p class="node-note">{{ t('Data sensing') }}</p>
    </div>
    <figcaption><IconArrowsExchange :size="15" stroke="1.5" aria-hidden="true" />{{ t('Bidirectional collaboration') }}</figcaption>
  </figure>
</template>
