<script setup lang="ts">
import { IconCloud, IconServer, IconCpu, IconDatabase } from '@tabler/icons-vue'
import { useI18n } from 'vue-i18n'
const { t } = useI18n()
const tiers = [
  { key: 'Cloud', subtitle: 'Cloud subtitle', icon: IconCloud, capabilities: ['Model inference cluster', 'Global scheduler', 'Disaggregated storage pool'] },
  { key: 'Edge', subtitle: 'Edge subtitle', icon: IconServer, capabilities: ['Request orchestration', 'Nearby offloading', 'State aggregation'] },
  { key: 'Device', subtitle: 'Device subtitle', icon: IconCpu, capabilities: ['Vibration sensing', 'Visual detection', 'Edge gateway'] },
]
const transfers = ['Cloud edge transfer', 'Edge device transfer']
</script>

<template>
  <section id="architecture" class="topology-section" aria-labelledby="topology-title">
    <div class="section-heading"><div><h2 id="topology-title">{{ t('Cloud edge device topology') }}</h2><p>{{ t('Topology description') }}</p></div><span class="section-meta">{{ t('Architecture schematic') }}</span></div>
    <div class="topology-panel" data-slot="card">
      <template v-for="(tier, index) in tiers" :key="tier.key">
        <div class="topology-tier" :data-tier="tier.key.toLowerCase()">
          <div class="tier-identity"><span class="small-icon"><component :is="tier.icon" :size="16" stroke="1.5" aria-hidden="true" /></span><div><h3>{{ t(tier.key) }}</h3><p>{{ t(tier.subtitle) }}</p></div></div>
          <ul class="tier-capabilities"><li v-for="capability in tier.capabilities" :key="capability"><span aria-hidden="true"></span>{{ t(capability) }}</li></ul>
        </div>
        <div v-if="index < 2" class="tier-transfer"><span v-for="line in 3" :key="line" class="transfer-line" aria-hidden="true"><i></i></span><p>{{ t(transfers[index]!) }}</p></div>
      </template>
      <div class="storage-foundation"><div class="foundation-copy"><IconDatabase :size="14" stroke="1.5" aria-hidden="true" /><p><strong>{{ t('Storage architecture') }}</strong><span>{{ t('Storage foundation description') }}</span></p></div><ul class="foundation-capabilities"><li v-for="key in ['Weight pool', 'KV cache', 'RDMA access']" :key="key">{{ t(key) }}</li></ul></div>
    </div>
  </section>
</template>
