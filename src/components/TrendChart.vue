<script setup lang="ts">
import { computed, onBeforeUnmount, shallowRef, useId, watch } from 'vue'

import {
  clearActive,
  htmlTooltip,
  loadChart,
  reducedMotion,
  showActive,
  token,
  withAlpha,
  type ChartType,
} from '@/lib/charts'
import { formatDuration } from '@/lib/format'

/**
 * One measure's last 7 days as a headline, against the 7 before, over its daily line for the
 * period, drawn with Chart.js. A single series in primary on its own scale; the cards beside it
 * have their own, so hours of music never squash hours in voice. Hover, or focus and use the
 * arrow keys, to read a day. The last day is today so far, so its segment is dashed.
 */
const props = defineProps<{
  label: string
  icon: string
  /** Milliseconds per day, oldest first. */
  daily?: number[]
  /** YYYY-MM-DD, matching `daily`. */
  dates?: string[]
  week?: number
  previousWeek?: number
  loading?: boolean
}>()

const id = useId()

const values = computed(() => props.daily ?? [])
const lastIndex = computed(() => values.value.length - 1)

const DATE = new Intl.DateTimeFormat('en', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
})
const SHORT_DATE = new Intl.DateTimeFormat('en', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
})
const asUtc = (date: string) => Date.parse(`${date}T00:00:00Z`)

function dayName(index: number): string {
  const date = props.dates?.[index]
  if (!date) return ''
  return index === lastIndex.value ? 'Today so far' : DATE.format(asUtc(date))
}

const firstLabel = computed(() =>
  props.dates?.[0] ? SHORT_DATE.format(asUtc(props.dates[0])) : '',
)

const hoursOrNone = (ms: number) => (ms < 30_000 ? 'None' : formatDuration(ms))

const delta = computed(() => {
  const week = props.week ?? 0
  const before = props.previousWeek ?? 0
  if (week === 0 && before === 0) return { icon: 'trending_flat', text: 'Nothing in 2 weeks' }
  if (before === 0) return { icon: 'trending_up', text: 'None the week before' }
  const percent = Math.round(((week - before) / before) * 100)
  if (percent === 0) return { icon: 'trending_flat', text: 'Same as the week before' }
  return {
    icon: percent > 0 ? 'trending_up' : 'trending_down',
    text: `${percent > 0 ? '+' : '−'}${Math.abs(percent).toLocaleString()}% on the week before`,
  }
})

// ---------------------------------------------------------------------------
// Chart
// ---------------------------------------------------------------------------

const canvas = shallowRef<HTMLCanvasElement | null>(null)
let chart: ChartType<'line', number[], string> | null = null

/** A vertical rule through the day being read. */
const crosshair = {
  id: 'crosshair',
  afterDatasetsDraw(target: ChartType) {
    const active = target.getActiveElements()[0]
    if (!active) return
    const { ctx, chartArea } = target
    ctx.save()
    ctx.strokeStyle = token('--color-outline')
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(Math.round(active.element.x) + 0.5, chartArea.top)
    ctx.lineTo(Math.round(active.element.x) + 0.5, chartArea.bottom)
    ctx.stroke()
    ctx.restore()
  },
}

async function draw() {
  const element = canvas.value
  if (!element || values.value.length === 0) return

  if (chart) {
    chart.data.labels = props.dates ?? []
    chart.data.datasets[0]!.data = values.value
    chart.update()
    return
  }

  const Chart = await loadChart()
  // The card may have gone back to loading, or another draw won, while Chart.js loaded.
  if (canvas.value !== element || chart) return

  const primary = token('--color-primary')
  chart = new Chart<'line', number[], string>(element, {
    type: 'line',
    data: {
      labels: props.dates ?? [],
      datasets: [
        {
          data: values.value,
          borderColor: primary,
          borderWidth: 2,
          borderJoinStyle: 'round',
          borderCapStyle: 'round',
          tension: 0,
          fill: 'origin',
          backgroundColor: ({ chart: target }) => {
            const area = target.chartArea
            if (!area) return withAlpha(primary, 0.16)
            const gradient = target.ctx.createLinearGradient(0, area.top, 0, area.bottom)
            gradient.addColorStop(0, withAlpha(primary, 0.28))
            gradient.addColorStop(1, withAlpha(primary, 0))
            return gradient
          },
          // Today so far: the segment into it is dashed.
          segment: {
            borderDash: (context) => (context.p1DataIndex === lastIndex.value ? [3, 4] : undefined),
          },
          pointRadius: 0,
          pointHitRadius: 12,
          pointHoverRadius: 5,
          pointHoverBorderWidth: 2,
          pointHoverBackgroundColor: primary,
          pointHoverBorderColor: token('--color-surface-container'),
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: reducedMotion() ? false : { duration: 300 },
      interaction: { mode: 'index', intersect: false },
      layout: { padding: { top: 4, left: 2, right: 2 } },
      scales: {
        // The baseline only; dates sit under the chart as text.
        x: {
          grid: { display: false, drawTicks: false },
          ticks: { display: false },
          border: { color: token('--color-outline-variant') },
        },
        y: { display: false, beginAtZero: true, grace: '12%' },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          ...htmlTooltip(),
          callbacks: {
            title: (items) => dayName(items[0]?.dataIndex ?? 0),
            label: (item) => hoursOrNone(item.parsed.y ?? 0),
          },
        },
      },
    },
    plugins: [crosshair],
  })
}

watch([canvas, values], () => {
  if (!canvas.value) {
    chart?.destroy()
    chart = null
  }
  void draw()
})

onBeforeUnmount(() => {
  chart?.destroy()
  chart = null
})

/** Arrow keys, Home and End move the tooltip day by day, as hovering does. */
function step(event: KeyboardEvent) {
  if (!chart || lastIndex.value < 0) return
  const current = chart.getActiveElements()[0]?.index
  let index: number
  if (event.key === 'Home') index = 0
  else if (event.key === 'End') index = lastIndex.value
  else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    const from = current ?? lastIndex.value + (event.key === 'ArrowLeft' ? 1 : 0)
    index = Math.min(Math.max(from + (event.key === 'ArrowLeft' ? -1 : 1), 0), lastIndex.value)
  } else return
  event.preventDefault()

  showActive(chart, 0, index)
}
</script>

<template>
  <section class="card flex flex-col gap-3 px-5 pt-4 pb-3" :aria-labelledby="`${id}-label`">
    <div class="flex items-center gap-2 text-on-surface-variant">
      <span class="icon [--icon-size:20px]" aria-hidden="true">{{ icon }}</span>
      <h3 :id="`${id}-label`" class="text-label-large">{{ label }}</h3>
    </div>

    <div class="flex flex-col gap-0.5">
      <span class="text-display-small font-medium">
        <span v-if="loading" class="skeleton inline-block h-[0.8em] w-[2.4em] align-middle" />
        <template v-else>{{ hoursOrNone(week ?? 0) }}</template>
      </span>
      <span class="text-body-small text-on-surface-variant">Last 7 days</span>
    </div>

    <p v-if="!loading" class="flex items-center gap-1 text-label-medium text-on-surface-variant">
      <span class="icon [--icon-size:16px]" aria-hidden="true">{{ delta.icon }}</span>
      {{ delta.text }}
    </p>
    <span v-else class="skeleton h-4 w-32 rounded-full" />

    <div v-if="loading" class="skeleton h-24 rounded-sm" />
    <template v-else>
      <div
        class="relative h-24 cursor-crosshair rounded-sm outline-offset-4 focus-visible:outline-2 focus-visible:outline-primary"
        tabindex="0"
        role="img"
        :aria-label="`${label} per day, ${dates?.length ?? 0} days. Use the arrow keys to read a day.`"
        @keydown="step"
        @blur="clearActive(chart)"
      >
        <canvas ref="canvas" />
      </div>

      <div class="flex justify-between text-label-small text-on-surface-variant" aria-hidden="true">
        <span>{{ firstLabel }}</span>
        <span>Today</span>
      </div>

      <!-- Hidden on a wrapper: a table caption escapes sr-only set on the table itself. -->
      <div class="sr-only">
        <table>
          <caption>
            {{
              label
            }}
            per day
          </caption>
          <thead>
            <tr>
              <th scope="col">Day</th>
              <th scope="col">Time</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(value, index) in values" :key="index">
              <th scope="row">{{ dayName(index) }}</th>
              <td>{{ hoursOrNone(value) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </section>
</template>
