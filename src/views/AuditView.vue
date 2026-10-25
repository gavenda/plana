<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import AuditSummary from '@/components/AuditSummary.vue'
import StateBlock from '@/components/StateBlock.vue'
import { apiFetch } from '@/lib/api'
import {
  auditIcon,
  describeAudit,
  toneContainerClass,
  type AuditEntry,
  type AuditPage,
} from '@/lib/audit'
import { absoluteTime, clockTime, dayLabel, startOfDay } from '@/lib/format'
import { useGuildStore } from '@/stores/guild'

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

const SOURCE_LABEL: Record<AuditEntry['source'], string> = {
  discord: 'Discord',
  dashboard: 'Dashboard',
  system: 'System',
}

/**
 * Entries grouped by local day, newest first (the order they arrive in), each day one segmented
 * list. Described once here so the template does not re-describe each item on every render.
 */
const days = computed(() => {
  const groups: {
    day: number
    label: string
    items: { entry: AuditEntry; description: ReturnType<typeof describeAudit> }[]
  }[] = []
  for (const entry of entries.value) {
    const day = startOfDay(entry.createdAt)
    let group = groups[groups.length - 1]
    if (!group || group.day !== day) {
      group = { day, label: dayLabel(entry.createdAt), items: [] }
      groups.push(group)
    }
    group.items.push({ entry, description: describeAudit(entry) })
  }
  return groups
})

const guild = useGuildStore()

onMounted(() => {
  // For role colours in the summaries; the log shows without them if this fails.
  void guild.load()
  void load()
})
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex items-center justify-between gap-4 px-4">
      <p class="text-headline-medium text-on-surface">
        {{ total }} recorded {{ total === 1 ? 'event' : 'events' }}
      </p>
      <button
        class="icon-btn icon-btn-tonal icon-btn-narrow"
        type="button"
        aria-label="Refresh"
        title="Refresh"
        :disabled="loading"
        @click="load"
      >
        <span class="icon [--icon-size:20px]" aria-hidden="true">refresh</span>
      </button>
    </div>

    <StateBlock
      :loading="loading && entries.length === 0"
      :error="error"
      :empty="entries.length === 0"
      empty-text="Nothing to report. I'll record every change here."
      empty-mood="standby"
      :retry="load"
    >
      <section v-for="group in days" :key="group.day" :aria-labelledby="`day-${group.day}`">
        <h2 :id="`day-${group.day}`" class="segmented-header">{{ group.label }}</h2>

        <ul class="segmented-list">
          <li v-for="{ entry, description } in group.items" :key="entry.id" class="segmented-item">
            <span
              class="grid size-10 shrink-0 place-items-center rounded-full"
              :class="toneContainerClass(description.tone)"
              aria-hidden="true"
            >
              <span class="icon [--icon-size:20px]">{{ auditIcon(entry.action) }}</span>
            </span>

            <div class="min-w-0 flex-1 py-1">
              <p class="text-body-large [overflow-wrap:anywhere]">
                <AuditSummary :parts="description.parts" />
              </p>
              <p class="text-body-medium text-on-surface-variant">
                {{ description.label }} · {{ SOURCE_LABEL[entry.source] ?? entry.source }}
              </p>
            </div>

            <time
              class="shrink-0 self-start pt-1 text-label-small text-on-surface-variant"
              :datetime="new Date(entry.createdAt).toISOString()"
              :title="absoluteTime(entry.createdAt)"
              >{{ clockTime(entry.createdAt) }}</time
            >
          </li>
        </ul>
      </section>

      <div v-if="cursor != null" class="flex justify-center pt-2">
        <button class="btn btn-tonal" :disabled="loadingMore" @click="loadMore">
          {{ loadingMore ? 'Loading…' : 'Load more' }}
        </button>
      </div>
    </StateBlock>
  </div>
</template>
