<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, shallowRef, watch } from 'vue'

import {
  clearActive,
  htmlTooltip,
  loadChart,
  mix,
  reducedMotion,
  showActive,
  token,
  type ChartType,
} from '@/lib/charts'
import { formatDuration } from '@/lib/format'

/**
 * A member's last 6 months, a square a day: a column per week, Monday at the top, shaded by
 * the time they spent in voice or in a game (counted once where those overlap). Drawn with
 * Chart.js and its matrix chart, in one hue scaled to their busiest day. Hover a day, or focus
 * the strip and use the arrow keys, to read it.
 */
const props = defineProps<{
  /** Oldest first, starting on a Monday; the last is today so far. */
  days: { date: string; voiceMs: number; gameMs: number; activeMs: number }[]
  timeZone: string
}>()

const SHORT_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const DATE = new Intl.DateTimeFormat('en', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
})
const MONTH = new Intl.DateTimeFormat('en', { month: 'short', timeZone: 'UTC' })
const asUtc = (date: string) => Date.parse(`${date}T00:00:00Z`)

const weeks = computed(() => Math.ceil(props.days.length / 7))
const peak = computed(() => Math.max(0, ...props.days.map((day) => day.activeMs)))

const lastIndex = computed(() => props.days.length - 1)
const dayName = (index: number) =>
  index === lastIndex.value ? 'Today so far' : DATE.format(asUtc(props.days[index]?.date ?? ''))

const hoursOrNone = (ms: number) => (ms < 30_000 ? 'None' : formatDuration(ms))

/** The week columns where a month starts, labelled with it. */
const monthTicks = computed(() => {
  const ticks: { week: number; label: string }[] = []
  let previous = ''
  for (let week = 0; week < weeks.value; week++) {
    const date = props.days[week * 7]?.date
    if (!date) continue
    const month = date.slice(0, 7)
    // The first column only gets a label if its month starts within it, so labels never crowd.
    if (month !== previous && (week > 0 || date.endsWith('-01'))) {
      ticks.push({ week, label: MONTH.format(asUtc(date)) })
    }
    previous = month
  }
  return ticks
})

const totals = computed(() => {
  const active = props.days.reduce((sum, day) => sum + day.activeMs, 0)
  const activeDays = props.days.filter((day) => day.activeMs >= 60_000).length
  return { active, activeDays }
})

// ---------------------------------------------------------------------------
// Chart
// ---------------------------------------------------------------------------

type Cell = { x: number; y: number; index: number }

const cells = computed<Cell[]>(() =>
  props.days.map((_, index) => ({ x: Math.floor(index / 7), y: index % 7, index })),
)

const canvas = shallowRef<HTMLCanvasElement | null>(null)
let chart: ChartType<'matrix', Cell[]> | null = null

function cellColor(index: number): string {
  const empty = token('--color-surface-container-highest')
  const ms = props.days[index]?.activeMs ?? 0
  if (ms < 60_000 || peak.value === 0) return empty
  return mix(empty, token('--color-primary'), 0.15 + (ms / peak.value) * 0.85)
}

/** The gap between squares, in pixels. */
const GAP = 3

async function draw() {
  const element = canvas.value
  if (!element) return

  if (chart) {
    chart.data.datasets[0]!.data = cells.value
    chart.options.scales!.x!.max = weeks.value - 0.5
    chart.update()
    return
  }

  const Chart = await loadChart()
  if (canvas.value !== element || chart) return

  const color = (context: { raw?: unknown }) =>
    cellColor((context.raw as Cell | undefined)?.index ?? -1)

  chart = new Chart(element, {
    type: 'matrix',
    data: {
      datasets: [
        {
          data: cells.value,
          backgroundColor: color,
          hoverBackgroundColor: color,
          borderWidth: 0,
          hoverBorderWidth: 2,
          hoverBorderColor: token('--color-on-surface'),
          borderRadius: 3,
          width: ({ chart: target }) => (target.chartArea?.width ?? 0) / weeks.value - GAP,
          height: ({ chart: target }) => (target.chartArea?.height ?? 0) / 7 - GAP,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: reducedMotion() ? false : { duration: 300 },
      scales: {
        x: {
          type: 'linear',
          position: 'top',
          min: -0.5,
          max: weeks.value - 0.5,
          grid: { display: false },
          border: { display: false },
          afterBuildTicks: (scale) => {
            scale.ticks = monthTicks.value.map(({ week }) => ({ value: week }))
          },
          ticks: {
            padding: 2,
            font: { size: 11 },
            autoSkip: false,
            maxRotation: 0,
            callback: (value) =>
              monthTicks.value.find((tick) => tick.week === Number(value))?.label ?? '',
          },
        },
        y: {
          type: 'linear',
          min: -0.5,
          max: 6.5,
          // Numbers count up the axis; reversed, Monday (0) is on top.
          reverse: true,
          grid: { display: false },
          border: { display: false },
          // Every other day, as on a calendar strip, so the labels stay legible.
          afterBuildTicks: (scale) => {
            scale.ticks = [0, 2, 4].map((value) => ({ value }))
          },
          ticks: {
            padding: 6,
            font: { size: 11 },
            callback: (value) => SHORT_DAYS[Number(value)] ?? '',
          },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          ...htmlTooltip(),
          callbacks: {
            title: (items) => dayName((items[0]?.raw as Cell | undefined)?.index ?? 0),
            label: (item) => {
              const day = props.days[(item.raw as Cell).index]
              if (!day || day.activeMs < 60_000) return 'Nothing recorded'
              return [
                `${hoursOrNone(day.activeMs)} active`,
                `Voice ${hoursOrNone(day.voiceMs)} · Games ${hoursOrNone(day.gameMs)}`,
              ]
            },
          },
        },
      },
    },
  })
}

onMounted(() => void draw())
watch(cells, () => void draw())

onBeforeUnmount(() => {
  chart?.destroy()
  chart = null
})

/** Arrow keys move a day (up and down) or a week (left and right); Home and End jump to the ends. */
function step(event: KeyboardEvent) {
  if (!chart || lastIndex.value < 0) return
  const current = chart.getActiveElements()[0]?.index
  const moves: Record<string, number> = { ArrowUp: -1, ArrowDown: 1, ArrowLeft: -7, ArrowRight: 7 }
  let index: number
  if (event.key === 'Home') index = 0
  else if (event.key === 'End') index = lastIndex.value
  else if (event.key in moves) {
    const next = (current ?? lastIndex.value) + (current == null ? 0 : moves[event.key]!)
    index = Math.min(Math.max(next, 0), lastIndex.value)
  } else return
  event.preventDefault()
  showActive(chart, 0, index)
}
</script>

<template>
  <div class="card flex flex-col gap-3 px-4 py-4">
    <div
      class="relative h-36 rounded-sm outline-offset-4 focus-visible:outline-2 focus-visible:outline-primary"
      tabindex="0"
      role="img"
      :aria-label="`Time in voice or games each day for ${weeks} weeks: ${formatDuration(totals.active)} on ${totals.activeDays} days. Use the arrow keys to read a day.`"
      @keydown="step"
      @blur="clearActive(chart)"
    >
      <canvas ref="canvas" />
    </div>

    <div class="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
      <p class="min-h-5 text-label-small text-on-surface-variant">
        {{ totals.activeDays.toLocaleString() }}
        {{ totals.activeDays === 1 ? 'active day' : 'active days' }} ·
        {{ hoursOrNone(totals.active) }} in voice or games
      </p>
      <div class="flex items-center gap-2 text-label-small text-on-surface-variant">
        <span>Less</span>
        <span
          class="h-2.5 w-24 rounded-full"
          :style="{
            background:
              'linear-gradient(to right, var(--color-surface-container-highest), var(--color-primary))',
          }"
          aria-hidden="true"
        />
        <span>More</span>
        <span class="pl-2">Days in {{ timeZone }}</span>
      </div>
    </div>

    <!-- Hidden on a wrapper: a table caption escapes sr-only set on the table itself. -->
    <div class="sr-only">
      <table>
        <caption>
          Time in voice or games per day
        </caption>
        <thead>
          <tr>
            <th scope="col">Day</th>
            <th scope="col">Active</th>
            <th scope="col">Voice</th>
            <th scope="col">Games</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(day, index) in days" :key="day.date">
            <th scope="row">{{ dayName(index) }}</th>
            <td>{{ hoursOrNone(day.activeMs) }}</td>
            <td>{{ hoursOrNone(day.voiceMs) }}</td>
            <td>{{ hoursOrNone(day.gameMs) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
