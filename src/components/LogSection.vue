<script setup lang="ts">
import { computed, onMounted, reactive, ref, shallowRef } from 'vue'

import AppSearchBar from '@/components/AppSearchBar.vue'
import FilterChip from '@/components/FilterChip.vue'
import RichTooltip from '@/components/RichTooltip.vue'
import StateBlock from '@/components/StateBlock.vue'
import { apiFetch } from '@/lib/api'
import { absoluteTime } from '@/lib/format'
import { useLive } from '@/lib/live'
import { formatLogEntry, LEVEL_STYLE, LOG_CAPACITY, LOG_FILTERS, type LogEntry } from '@/lib/logs'
import { useSnackbar } from '@/lib/snackbar'
import { useAsync } from '@/lib/useAsync'

const snackbar = useSnackbar()
const { data, loading, error, run } = useAsync(() => apiFetch<{ entries: LogEntry[] }>('/api/logs'))

/** Oldest first, as the server keeps them; shown newest first. */
const entries = shallowRef<LogEntry[]>([])
const query = ref('')
const paused = ref(false)
/** Entries that arrived while paused, shown on resume. */
let held: LogEntry[] = []
const expanded = reactive(new Set<number>())
const shown = reactive<Record<string, boolean>>(
  Object.fromEntries(LOG_FILTERS.map((filter) => [filter.id, filter.id !== 'debug'])),
)

async function load() {
  await run()
  if (data.value) {
    entries.value = data.value.entries
    held = []
  }
}

onMounted(load)

function append(added: LogEntry[]) {
  const next = [...entries.value, ...added]
  entries.value = next.length > LOG_CAPACITY ? next.slice(next.length - LOG_CAPACITY) : next
}

// The server's log viewer sink streams each record here; null means a reconnect, so reload.
useLive('logs', (message) => {
  if (!message) return void load()
  if (paused.value) held.push(message.entry)
  else append([message.entry])
})

function togglePause() {
  paused.value = !paused.value
  if (!paused.value && held.length > 0) {
    append(held)
    held = []
  }
}

const visible = computed(() => {
  const levels = new Set(LOG_FILTERS.filter((filter) => shown[filter.id]).flatMap((f) => f.levels))
  const needle = query.value.trim().toLowerCase()
  return entries.value
    .filter(
      (entry) =>
        levels.has(entry.level) &&
        (!needle ||
          entry.message.toLowerCase().includes(needle) ||
          entry.category.toLowerCase().includes(needle)),
    )
    .reverse()
})

function time(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('en-GB', { hour12: false })
}

function toggle(entry: LogEntry) {
  if (!entry.detail) return
  if (expanded.has(entry.id)) expanded.delete(entry.id)
  else expanded.add(entry.id)
}

async function copyShown() {
  try {
    await navigator.clipboard.writeText([...visible.value].reverse().map(formatLogEntry).join('\n'))
    snackbar.show(
      `Copied ${visible.value.length} ${visible.value.length === 1 ? 'line' : 'lines'}.`,
    )
  } catch (cause) {
    snackbar.showError(cause, 'Could not copy the log.')
  }
}
</script>

<template>
  <section aria-labelledby="settings-logs">
    <div class="section-header">
      <div class="flex items-center gap-1">
        <h2 id="settings-logs" class="text-title-medium">Logs</h2>
        <RichTooltip
          title="Logs"
          text="What Plana has logged since she last started, newest first."
        />
      </div>
      <div class="flex items-center gap-1 pr-2">
        <RichTooltip
          action
          :title="paused ? 'Resume' : 'Pause'"
          :text="
            paused
              ? 'Show the lines held while paused, and new ones as they arrive.'
              : 'Hold new lines so the list stays still while you read it.'
          "
          :icon="paused ? 'play_arrow' : 'pause'"
          @click="togglePause"
        />
        <RichTooltip
          action
          title="Copy shown lines"
          text="Copies the lines the search and filters leave, oldest first, with stack traces."
          icon="content_copy"
          :disabled="visible.length === 0"
          @click="copyShown"
        />
      </div>
    </div>

    <div class="card card-body flex flex-col gap-4">
      <AppSearchBar v-model="query" placeholder="Search the log" label="Search the log">
        <template v-if="query" #trailing>
          <span class="text-body-small">{{ visible.length }}</span>
        </template>
      </AppSearchBar>

      <div class="flex flex-wrap gap-2" role="group" aria-label="Levels">
        <FilterChip
          v-for="filter in LOG_FILTERS"
          :key="filter.id"
          v-model="shown[filter.id]!"
          :label="filter.label"
        />
      </div>

      <StateBlock :loading="!data && loading" :error="data ? null : error" :retry="load">
        <template #skeleton>
          <div class="flex flex-col gap-2">
            <span v-for="line in 8" :key="line" class="skeleton h-4" />
          </div>
        </template>

        <p
          v-if="visible.length === 0"
          class="py-8 text-center text-body-medium text-on-surface-variant"
        >
          {{ entries.length === 0 ? 'Nothing logged yet.' : 'No lines match.' }}
        </p>
        <ol
          v-else
          class="max-h-[32rem] overflow-y-auto rounded-sm bg-surface-container-highest py-2 font-mono text-body-small"
          aria-live="off"
        >
          <li v-for="entry in visible" :key="entry.id">
            <component
              :is="entry.detail ? 'button' : 'div'"
              :type="entry.detail ? 'button' : undefined"
              class="flex w-full gap-3 px-4 py-0.5 text-left"
              :class="{ 'state-layer cursor-pointer': entry.detail }"
              :aria-expanded="entry.detail ? expanded.has(entry.id) : undefined"
              @click="toggle(entry)"
            >
              <time
                class="shrink-0 text-on-surface-variant"
                :datetime="new Date(entry.time).toISOString()"
                :title="absoluteTime(entry.time)"
                >{{ time(entry.time) }}</time
              >
              <span class="shrink-0" :class="LEVEL_STYLE[entry.level].tone">{{
                LEVEL_STYLE[entry.level].label
              }}</span>
              <span class="shrink-0 text-tertiary">{{ entry.category }}</span>
              <span class="min-w-0 flex-1 break-words whitespace-pre-wrap">{{
                entry.message
              }}</span>
              <span
                v-if="entry.detail"
                class="shrink-0 icon text-on-surface-variant [--icon-size:16px]"
                aria-hidden="true"
                >{{ expanded.has(entry.id) ? 'expand_less' : 'expand_more' }}</span
              >
            </component>
            <pre
              v-if="entry.detail && expanded.has(entry.id)"
              class="mx-4 mb-2 overflow-x-auto rounded-xs bg-surface-container px-3 py-2 text-on-surface-variant"
              >{{ entry.detail }}</pre>
          </li>
        </ol>
      </StateBlock>

      <p v-if="paused" class="supporting-text px-0 text-warning">
        Paused. New lines are held until you resume.
      </p>
    </div>
  </section>
</template>
