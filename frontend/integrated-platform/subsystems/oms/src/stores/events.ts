import { ref } from 'vue'
import { defineStore } from 'pinia'
import { errorMessage, requestJson } from '../api/client'
import type { EventCatalog, EventRecord, EventStatus } from '../api/types'

export const useEventsStore = defineStore('events', () => {
  const events = ref<EventRecord[]>([])
  const loading = ref(false)
  const error = ref('')
  const warnings = ref<string[]>([])
  const selectedRecordId = ref('')
  let pendingRequest: Promise<void> | null = null

  function loadEvents(): Promise<void> {
    if (pendingRequest) return pendingRequest
    loading.value = true
    error.value = ''
    pendingRequest = requestJson<EventCatalog>('/api/events')
      .then((catalog) => {
        events.value = catalog.events
        warnings.value = catalog.warnings ?? []
        if (!events.value.some((record) => record.record_id === selectedRecordId.value)) {
          selectedRecordId.value = ''
        }
      })
      .catch((reason: unknown) => { error.value = errorMessage(reason) })
      .finally(() => { loading.value = false; pendingRequest = null })
    return pendingRequest
  }

  async function setEventStatus(record: EventRecord, status: EventStatus): Promise<void> {
    await requestJson(`/api/event/${encodeURIComponent(record.event_id)}/status`, {
      method: 'POST', body: JSON.stringify({ status, record_id: record.record_id }),
    })
    await loadEvents()
  }

  return { events, loading, error, warnings, selectedRecordId, loadEvents, setEventStatus }
})
