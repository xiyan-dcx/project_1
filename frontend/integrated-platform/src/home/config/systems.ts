import { IconActivityHeartbeat, IconRoute, IconBrain, IconDatabase } from '@tabler/icons-vue'
import type { Component } from 'vue'

export interface ResearchSystem {
  id: string
  number: string
  titleKey: string
  english: string
  layerKey: string
  descriptionKey: string
  questionKey: string
  tagKeys: string[]
  icon: Component
  href: string
}

// Replace href with each team's final URL. Absolute URLs open normally;
// current hash URLs intentionally lead to local demonstration entries.
export const systems: ResearchSystem[] = [
  {
    id: 'fault-diagnosis', number: '01', titleKey: 'Fault diagnosis', english: 'Fault Diagnosis',
    layerKey: 'Device layer', descriptionKey: 'Diagnosis description', questionKey: 'Device question',
    tagKeys: ['State sensing', 'Fault analysis'], icon: IconActivityHeartbeat,
    href: 'http://127.0.0.1:15001/diagnosis',
  },
  {
    id: 'intelligent-scheduling', number: '02', titleKey: 'Intelligent scheduling', english: 'Intelligent Scheduling',
    layerKey: 'Network layer', descriptionKey: 'Scheduling description', questionKey: 'Network question',
    tagKeys: ['Resource awareness', 'Request scheduling'], icon: IconRoute,
    href: 'http://10.166.33.36:5173/',
  },
  {
    id: 'model-inference', number: '03', titleKey: 'Model inference', english: 'Model Inference',
    layerKey: 'Service layer', descriptionKey: 'Inference description', questionKey: 'Service question',
    tagKeys: ['Collaborative inference', 'Large model services'], icon: IconBrain,
    href: '#/systems/model-inference',
  },
  {
    id: 'storage-compute', number: '04', titleKey: 'Disaggregated storage and compute', english: 'Disaggregated Storage & Compute',
    layerKey: 'Architecture layer', descriptionKey: 'Storage description', questionKey: 'Architecture question',
    tagKeys: ['Independent scaling', 'Efficient computing'], icon: IconDatabase,
    href: '#/systems/storage-compute',
  },
]
