<script setup lang="ts">
import { computed, onBeforeUnmount, shallowRef, watch } from 'vue'

import {
  clearActive,
  htmlTooltip,
  loadChart,
  reducedMotion,
  showActive,
  token,
  type ChartType,
} from '@/lib/charts'
import { formatDuration } from '@/lib/format'

/**
 * Each voice channel's share of the time someone was in voice, as one stacked bar drawn with
 * Chart.js. The four busiest get the chart colours in order (validated as adjacent pairs, which
 * is what a stack puts side by side); the rest fold into "Other" in grey. A legend under the bar
 * names every segment with its share and time, so colour is never the only label.
 */
const props = defineProps<{
  /** Busiest first. `ms` is the time someone was in the channel. */
  channels: { id: string; name: string; ms: number }[]
}>()

const SLOTS = 4

type Segment = { key: string; name: string; ms: number; share: number; color: string }

const segments = computed<Segment[]>(() => {
  const total = props.channels.reduce((sum, channel) => sum + channel.ms, 0)
  if (total === 0) return []
  const share = (ms: number) => ms / total
  const top = props.channels.slice(0, SLOTS).map((channel, index) => ({
    key: channel.id,
    name: channel.name,
    ms: channel.ms,
    share: share(channel.ms),
    color: `--color-chart-${index + 1}`,
  }))
  const rest = props.channels.slice(SLOTS)
  const restMs = rest.reduce((sum, channel) => sum + channel.ms, 0)
  if (restMs === 0) return top
  return [
    ...top,
    {
      key: 'other',
      name: rest.length === 1 ? rest[0]!.name : `${rest.length} others`,
      ms: restMs,
      share: share(restMs),
      color: '--color-chart-other',
    },
  ]
})

const percent = (share: number) =>
  `${(share * 100).toLocaleString('en', { maximumFractionDigits: share < 0.1 ? 1 : 0 })}%`

const summary = computed(() =>
  segments.value.map((segment) => `${segment.name} ${percent(segment.share)}`).join(', '),
)

// ---------------------------------------------------------------------------
// Chart
// ---------------------------------------------------------------------------

const canvas = shallowRef<HTMLCanvasElement | null>(null)
let chart: ChartType<'bar', number[], string> | null = null

function datasets() {
  const gap = token('--color-surface-container')
  return segments.value.map((segment) => ({
    label: segment.name,
    data: [segment.ms],
    backgroundColor: token(segment.color),
    hoverBackgroundColor: token(segment.color),
    // A 2px gap of card surface between segments.
    borderColor: gap,
    hoverBorderColor: gap,
    borderWidth: 2,
    borderSkipped: false as const,
    borderRadius: 6,
    barThickness: 24,
  }))
}

async function draw() {
  const element = canvas.value
  if (!element) return

  if (chart) {
    chart.data.datasets = datasets()
    chart.update()
    return
  }

  const Chart = await loadChart()
  if (canvas.value !== element || chart) return

  chart = new Chart<'bar', number[], string>(element, {
    type: 'bar',
    data: { labels: ['Share'], datasets: datasets() },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      animation: reducedMotion() ? false : { duration: 300 },
      interaction: { mode: 'nearest', intersect: true },
      scales: {
        x: { stacked: true, display: false, min: 0 },
        y: { stacked: true, display: false },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          ...htmlTooltip(),
          callbacks: {
            title: (items) => items[0]?.dataset.label ?? '',
            label: (item) => {
              const segment = segments.value[item.datasetIndex]
              return segment ? `${percent(segment.share)} · ${formatDuration(segment.ms)}` : ''
            },
          },
        },
      },
    },
  })
}

watch([canvas, segments], () => {
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

/** Arrow keys move along the segments, as hovering does. */
function step(event: KeyboardEvent) {
  if (!chart || segments.value.length === 0) return
  const last = segments.value.length - 1
  const current = chart.getActiveElements()[0]?.datasetIndex
  let index: number
  if (event.key === 'Home') index = 0
  else if (event.key === 'End') index = last
  else if (event.key === 'ArrowLeft') index = Math.max((current ?? 1) - 1, 0)
  else if (event.key === 'ArrowRight') index = Math.min((current ?? -1) + 1, last)
  else return
  event.preventDefault()

  showActive(chart, index, 0)
}
</script>

<template>
  <div v-if="segments.length > 0" class="card flex flex-col gap-3 px-4 py-4">
    <div
      class="relative h-7 rounded-sm outline-offset-4 focus-visible:outline-2 focus-visible:outline-primary"
      tabindex="0"
      role="img"
      :aria-label="`Share of time in voice by channel: ${summary}. Use the arrow keys to read a channel.`"
      @keydown="step"
      @blur="clearActive(chart)"
    >
      <canvas ref="canvas" />
    </div>

    <ul class="flex flex-wrap gap-x-5 gap-y-1.5 text-label-small text-on-surface-variant">
      <li v-for="segment in segments" :key="segment.key" class="flex min-w-0 items-center gap-1.5">
        <span
          class="size-2.5 shrink-0 rounded-full"
          :style="{ backgroundColor: `var(${segment.color})` }"
          aria-hidden="true"
        />
        <span class="max-w-40 truncate text-on-surface" :title="segment.name">{{
          segment.name
        }}</span>
        <span class="tabular-nums">{{ percent(segment.share) }}</span>
      </li>
    </ul>
  </div>
</template>
