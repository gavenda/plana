<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, shallowRef, watch } from 'vue'

import {
  clearActive,
  htmlTooltip,
  loadChart,
  mix,
  reducedMotion,
  scaleStep,
  showActive,
  token,
  type ChartType,
} from '@/lib/charts'

/**
 * When the server is in voice, playing games or listening on Spotify: a weekday by hour grid,
 * each cell the average number of members doing it then, drawn with Chart.js and its matrix
 * chart. One hue, from the empty surface up to primary, scaled to the busiest hour. Hover a cell, or focus the grid and use the arrow keys,
 * to read it. A hidden table carries the same numbers for screen readers.
 */
const props = defineProps<{
  /** Average members doing it, by weekday (Monday first) then hour. */
  grid: number[][]
  /** What the cells count, which sets the wording. */
  kind: 'voice' | 'games' | 'music'
  timeZone: string
}>()

const DOING = { voice: 'in voice', games: 'playing', music: 'listening' } as const
const NOBODY = {
  voice: 'Nobody spent time in voice in this period.',
  games: 'Nobody played games in this period.',
  music: 'Nobody listened on Spotify in this period.',
} as const

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const SHORT_DAYS = WEEKDAYS.map((day) => day.slice(0, 3))
const HOURS = Array.from({ length: 24 }, (_, hour) => hour)

/** The gap between cells, in pixels. */
const GAP = 2

const peak = computed(() => Math.max(0, ...props.grid.flat()))

const hourLabel = (hour: number) => `${String(hour).padStart(2, '0')}:00`
const people = (value: number) =>
  value === 0
    ? 'Nobody'
    : `${value.toLocaleString('en', { maximumFractionDigits: value < 10 ? 1 : 0 })} ${
        value >= 0.95 && value < 1.05 ? 'member' : 'members'
      }`

const slotName = (weekday: number, hour: number) =>
  `${WEEKDAYS[weekday]} ${hourLabel(hour)}–${hourLabel((hour + 1) % 24)}`

function describeCell(weekday: number, hour: number) {
  const value = props.grid[weekday]?.[hour] ?? 0
  return `${slotName(weekday, hour)}: ${people(value)} ${DOING[props.kind]} on average`
}

/** The busiest hour, said under the grid. */
const busiest = computed(() => {
  let best = { weekday: 0, hour: 0, value: 0 }
  props.grid.forEach((hours, weekday) =>
    hours.forEach((value, hour) => {
      if (value > best.value) best = { weekday, hour, value }
    }),
  )
  return best
})

const summary = computed(() =>
  busiest.value.value === 0
    ? NOBODY[props.kind]
    : `Busiest: ${describeCell(busiest.value.weekday, busiest.value.hour)}`,
)

// ---------------------------------------------------------------------------
// Chart
// ---------------------------------------------------------------------------

type Cell = { x: number; y: number; v: number }

/** One cell per weekday and hour, Monday's first. */
const cells = computed<Cell[]>(() =>
  props.grid.flatMap((hours, weekday) => hours.map((v, x) => ({ x, y: weekday, v }))),
)

const canvas = shallowRef<HTMLCanvasElement | null>(null)
let chart: ChartType<'matrix', Cell[]> | null = null

/** The cell's colour: primary mixed into the empty surface by its share of the peak. */
function cellColor(value: number): string {
  const empty = token('--color-surface-container-highest')
  if (value <= 0 || peak.value === 0) return empty
  // Never fainter than 12%, so a quiet hour that had someone still reads as not empty.
  return mix(empty, token('--color-primary'), 0.12 + (value / peak.value) * 0.88)
}

async function draw() {
  const element = canvas.value
  if (!element) return

  if (chart) {
    chart.data.datasets[0]!.data = cells.value
    chart.update()
    return
  }

  const Chart = await loadChart()
  if (canvas.value !== element || chart) return

  chart = new Chart(element, {
    type: 'matrix',
    data: {
      datasets: [
        {
          data: cells.value,
          backgroundColor: (context) => cellColor((context.raw as Cell | undefined)?.v ?? 0),
          hoverBackgroundColor: (context) => cellColor((context.raw as Cell | undefined)?.v ?? 0),
          borderWidth: 0,
          hoverBorderWidth: 2,
          hoverBorderColor: token('--color-on-surface'),
          borderRadius: 4,
          width: ({ chart: target }) => Math.max(scaleStep(target, 'x') - GAP, 0),
          height: ({ chart: target }) => Math.max(scaleStep(target, 'y') - GAP, 0),
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
          max: 23.5,
          offset: false,
          grid: { display: false },
          border: { display: false },
          // A label every 3 hours, on the hour rather than at the axis's half-hour edge.
          afterBuildTicks: (scale) => {
            scale.ticks = HOURS.filter((hour) => hour % 3 === 0).map((value) => ({ value }))
          },
          ticks: {
            padding: 2,
            font: { size: 11 },
            callback: (value) => String(value).padStart(2, '0'),
          },
        },
        y: {
          type: 'linear',
          // The matrix chart turns `offset` on, which pads the ends and squeezes the rows.
          offset: false,
          min: -0.5,
          max: 6.5,
          // Numbers count up the axis; reversed, Monday (0) is on top.
          reverse: true,
          afterBuildTicks: (scale) => {
            scale.ticks = SHORT_DAYS.map((_, value) => ({ value }))
          },
          grid: { display: false },
          border: { display: false },
          ticks: {
            font: { size: 12 },
            padding: 6,
            callback: (value) => SHORT_DAYS[Number(value)] ?? '',
          },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          ...htmlTooltip(),
          callbacks: {
            title: (items) => {
              const cell = items[0]?.raw as Cell | undefined
              return cell ? slotName(cell.y, cell.x) : ''
            },
            label: (item) => `${people((item.raw as Cell).v)} ${DOING[props.kind]} on average`,
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

/** Arrow keys move between cells, as hovering does; Home and End jump along the day. */
function step(event: KeyboardEvent) {
  if (!chart) return
  const current = chart.getActiveElements()[0]?.index ?? -1
  let weekday = current < 0 ? busiest.value.weekday : Math.floor(current / 24)
  let hour = current < 0 ? busiest.value.hour : current % 24
  if (current >= 0) {
    if (event.key === 'ArrowLeft') hour = Math.max(hour - 1, 0)
    else if (event.key === 'ArrowRight') hour = Math.min(hour + 1, 23)
    else if (event.key === 'ArrowUp') weekday = Math.max(weekday - 1, 0)
    else if (event.key === 'ArrowDown') weekday = Math.min(weekday + 1, 6)
    else if (event.key === 'Home') hour = 0
    else if (event.key === 'End') hour = 23
    else return
  } else if (
    !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)
  ) {
    return
  }
  event.preventDefault()

  const index = weekday * 24 + hour
  showActive(chart, 0, index)
}
</script>

<template>
  <div class="card flex flex-col gap-3 px-4 py-4">
    <div
      class="relative h-56 rounded-sm outline-offset-4 focus-visible:outline-2 focus-visible:outline-primary"
      tabindex="0"
      role="img"
      :aria-label="`Average members ${DOING[kind]} by weekday and hour, in ${timeZone}. Use the arrow keys to read an hour.`"
      @keydown="step"
      @blur="clearActive(chart)"
    >
      <canvas ref="canvas" />
    </div>

    <div class="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
      <p class="min-h-5 text-label-small text-on-surface-variant">{{ summary }}</p>
      <div class="flex items-center gap-2 text-label-small text-on-surface-variant">
        <span>Fewer</span>
        <span
          class="h-2.5 w-24 rounded-full"
          :style="{
            background:
              'linear-gradient(to right, var(--color-surface-container-highest), var(--color-primary))',
          }"
          aria-hidden="true"
        />
        <span>More</span>
        <span class="pl-2">Times in {{ timeZone }}</span>
      </div>
    </div>

    <!-- Hidden on a wrapper: a table caption escapes sr-only set on the table itself. -->
    <div class="sr-only">
      <table>
        <caption>
          Average members
          {{
            DOING[kind]
          }}
          by weekday and hour, in
          {{
            timeZone
          }}
        </caption>
        <thead>
          <tr>
            <th scope="col">Day</th>
            <th v-for="hour in HOURS" :key="hour" scope="col">{{ hourLabel(hour) }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(day, weekday) in WEEKDAYS" :key="day">
            <th scope="row">{{ day }}</th>
            <td v-for="hour in HOURS" :key="hour">{{ people(grid[weekday]?.[hour] ?? 0) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
