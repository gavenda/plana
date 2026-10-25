<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import StateBlock from '@/components/StateBlock.vue'
import { apiFetch } from '@/lib/api'
import { describeAudit, toneClass, type AuditEntry, type AuditPage } from '@/lib/audit'
import { absoluteTime, relativeTime } from '@/lib/format'

const entries = ref<AuditEntry[]>([])
const total = ref(0)
const cursor = ref<number | null>(null)
const loading = ref(false)
const loadingMore = ref(false)
const error = ref<string | null>(null)

async function fetchPage(before?: number) {
  const query = new URLSearchParams({ limit: '50' })
  if (before != null) query.set('before', String(before))
  return apiFetch<AuditPage>(`/api/audit?${query}`)
}

async function load() {
  loading.value = true
  error.value = null
  try {
    const page = await fetchPage()
    entries.value = page.entries
    cursor.value = page.nextCursor
    total.value = page.total
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Could not load the audit log.'
  } finally {
    loading.value = false
  }
}

async function loadMore() {
  if (cursor.value == null || loadingMore.value) return

  loadingMore.value = true
  try {
    const page = await fetchPage(cursor.value)
    entries.value = [...entries.value, ...page.entries]
    cursor.value = page.nextCursor
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Could not load more entries.'
  } finally {
    loadingMore.value = false
  }
}

/** Precomputed so the template does not re-describe each row on every render. */
const rows = computed(() =>
  entries.value.map((entry) => ({ entry, description: describeAudit(entry) })),
)

onMounted(load)
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="card">
      <div class="card-header">
        <div>
          <p class="text-title-medium">Activity</p>
          <p class="text-body-medium text-on-surface-variant">
            {{ total }} recorded {{ total === 1 ? 'event' : 'events' }}.
          </p>
        </div>
        <button class="btn btn-text btn-sm" :disabled="loading" @click="load">Refresh</button>
      </div>

      <StateBlock
        :loading="loading && entries.length === 0"
        :error="error"
        :empty="entries.length === 0"
        empty-text="Nothing to report. I'll record every change here."
        empty-mood="standby"
        :retry="load"
      >
        <div class="overflow-x-auto">
          <table class="data-table">
            <thead>
              <tr>
                <th>Event</th>
                <th>Details</th>
                <th>Source</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in rows" :key="row.entry.id">
                <td>
                  <span :class="toneClass(row.description.tone)">{{ row.description.label }}</span>
                </td>
                <td class="break-words">{{ row.description.summary }}</td>
                <td class="text-on-surface-variant">{{ row.entry.source }}</td>
                <td
                  :title="absoluteTime(row.entry.createdAt)"
                  class="whitespace-nowrap text-on-surface-variant"
                >
                  {{ relativeTime(row.entry.createdAt) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div
          v-if="cursor != null"
          class="flex justify-center border-t border-outline-variant px-6 py-4"
        >
          <button class="btn btn-tonal btn-sm" :disabled="loadingMore" @click="loadMore">
            {{ loadingMore ? 'Loading…' : 'Load more' }}
          </button>
        </div>
      </StateBlock>
    </div>
  </div>
</template>
