<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import AppSearchBar from '@/components/AppSearchBar.vue'
import AuditSummary from '@/components/AuditSummary.vue'
import FilterChip from '@/components/FilterChip.vue'
import RefreshButton from '@/components/RefreshButton.vue'
import SkeletonList from '@/components/SkeletonList.vue'
import StateBlock from '@/components/StateBlock.vue'
import { apiFetch } from '@/lib/api'
import {
  AUDIT_CATEGORIES,
  auditIcon,
  describeAudit,
  toneContainerClass,
  type AuditCategory,
  type AuditEntry,
  type AuditPage,
} from '@/lib/audit'
import { absoluteTime, clockTime, dayLabel, startOfDay } from '@/lib/format'
import { useLive } from '@/lib/live'
import { useGuildStore } from '@/stores/guild'

const entries = ref<AuditEntry[]>([])
const total = ref(0)
const cursor = ref<number | null>(null)
// Loading from the start: the first page is requested on mount.
const loading = ref(true)
const loadingMore = ref(false)
const error = ref<string | null>(null)

const route = useRoute()
const router = useRouter()

const CATEGORY_IDS = AUDIT_CATEGORIES.map((category) => category.id) as readonly string[]

/** The search and filters live in the URL, so a filtered view survives a reload and can be shared. */
function categoriesFromQuery(): AuditCategory[] {
  const raw = typeof route.query.categories === 'string' ? route.query.categories : ''
  return raw.split(',').filter((id): id is AuditCategory => CATEGORY_IDS.includes(id))
}

const search = ref(typeof route.query.q === 'string' ? route.query.q : '')
const categories = ref<AuditCategory[]>(categoriesFromQuery())

const filtering = computed(() => search.value.trim() !== '' || categories.value.length > 0)

function isSelected(category: AuditCategory): boolean {
  return categories.value.includes(category)
}

function setSelected(category: AuditCategory, selected: boolean) {
  categories.value = selected
    ? AUDIT_CATEGORIES.map((entry) => entry.id).filter(
        (id) => id === category || categories.value.includes(id),
      )
    : categories.value.filter((id) => id !== category)
}

function clearFilters() {
  search.value = ''
  categories.value = []
}

async function fetchPage(before?: number, after?: number) {
  const query = new URLSearchParams({ limit: '50' })
  if (before != null) query.set('before', String(before))
  if (after != null) query.set('after', String(after))
  const text = search.value.trim()
  if (text) query.set('search', text)
  if (categories.value.length > 0) query.set('categories', categories.value.join(','))
  return apiFetch<AuditPage>(`/api/audit?${query}`)
}

/** Bumped on every fresh load, so a slow response to an older search cannot overwrite a newer one. */
let generation = 0

async function load() {
  const current = ++generation
  loading.value = true
  error.value = null
  try {
    const page = await fetchPage()
    if (current !== generation) return
    entries.value = page.entries
    cursor.value = page.nextCursor
    total.value = page.total
  } catch (cause) {
    if (current !== generation) return
    error.value = cause instanceof Error ? cause.message : 'Could not load the audit log.'
  } finally {
    if (current === generation) loading.value = false
  }
}

function syncQuery() {
  const text = search.value.trim()
  void router.replace({
    query: {
      ...route.query,
      q: text || undefined,
      categories: categories.value.length > 0 ? categories.value.join(',') : undefined,
    },
  })
}

/** Typing waits for a pause before searching; a chip applies at once. */
const SEARCH_DEBOUNCE_MS = 250
let searchTimer: ReturnType<typeof setTimeout> | undefined

watch(search, () => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    syncQuery()
    void load()
  }, SEARCH_DEBOUNCE_MS)
})

watch(categories, () => {
  clearTimeout(searchTimer)
  syncQuery()
  void load()
})

onBeforeUnmount(() => clearTimeout(searchTimer))

async function loadMore() {
  if (cursor.value == null || loadingMore.value) return

  loadingMore.value = true
  try {
    const current = generation
    const page = await fetchPage(cursor.value)
    if (current !== generation) return
    entries.value = [...entries.value, ...page.entries]
    cursor.value = page.nextCursor
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Could not load more entries.'
  } finally {
    loadingMore.value = false
  }
}

/** Adds entries newer than the ones shown, keeping whatever pages are already loaded. */
function prepend(newer: AuditEntry[]) {
  const shown = new Set(entries.value.map((entry) => entry.id))
  const fresh = newer.filter((entry) => !shown.has(entry.id))
  if (fresh.length > 0) entries.value = [...fresh, ...entries.value]
  return fresh.length
}

/**
 * New entries join the top as they're recorded. Unfiltered, the message's own entry goes
 * straight in; the search runs on the server, so with a filter (or after a reconnect) the
 * server is asked for whatever is newer than the top entry and matches.
 */
useLive('audit', async (message) => {
  if (loading.value || error.value) return
  if (message && !filtering.value) {
    total.value += prepend([message.entry])
    return
  }
  const current = generation
  try {
    const page = await fetchPage(undefined, entries.value[0]?.id ?? 0)
    if (current !== generation) return
    // More than a page arrived (a long disconnect): start over rather than leave a gap.
    if (page.nextCursor != null) return void load()
    prepend(page.entries)
    total.value = page.total
  } catch {
    // The next entry, or the refresh button, tries again.
  }
})

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
      <span
        v-if="loading && entries.length === 0"
        class="skeleton my-1.5 h-6 w-56"
        aria-hidden="true"
      />
      <p v-else class="text-headline-medium text-on-surface" aria-live="polite">
        {{ total }} {{ filtering ? 'matching' : 'recorded' }} {{ total === 1 ? 'event' : 'events' }}
      </p>
      <RefreshButton :disabled="loading" @click="load" />
    </div>

    <div role="search" class="flex flex-col gap-3">
      <AppSearchBar
        v-model="search"
        placeholder="Search names, messages, channels and reasons"
        label="Search the audit log"
      />

      <div class="flex flex-wrap gap-2" role="group" aria-label="Filter by kind">
        <FilterChip
          v-for="category in AUDIT_CATEGORIES"
          :key="category.id"
          :label="category.label"
          :model-value="isSelected(category.id)"
          @update:model-value="setSelected(category.id, $event)"
        />
        <button v-if="filtering" class="btn btn-text btn-sm" type="button" @click="clearFilters">
          Clear all
        </button>
      </div>
    </div>

    <StateBlock
      :loading="loading && entries.length === 0"
      :error="error"
      :empty="entries.length === 0"
      :empty-text="
        filtering
          ? 'No records match. Try fewer filters or another word.'
          : 'Nothing to report. I\'ll record every change here.'
      "
      empty-mood="standby"
      :retry="load"
    >
      <template #skeleton>
        <div>
          <span class="skeleton mx-4 mt-4 mb-3 h-3 w-20" />
          <SkeletonList :rows="5" two-line trailing="text" />
        </div>
      </template>
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
              <div
                v-for="quote in description.quotes ?? []"
                :key="quote.label"
                class="mt-2 rounded-lg bg-surface-container-highest px-3 py-2"
              >
                <p class="text-label-medium text-on-surface-variant">{{ quote.label }}</p>
                <p
                  class="max-h-60 overflow-y-auto text-body-medium [overflow-wrap:anywhere] whitespace-pre-wrap"
                  v-text="quote.text"
                />
              </div>
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
