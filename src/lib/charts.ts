/**
 * Chart.js for the dashboard's charts. It draws on a canvas, so it only ever loads in the
 * browser (from `onMounted`), never during SSR, and only on pages that have a chart.
 * Canvas can't read CSS variables, so colours come from the theme's tokens at draw time.
 */

import type { Chart as ChartType, TooltipModel } from 'chart.js'

export type { ChartType }

let loading: Promise<typeof import('chart.js').Chart> | null = null

/** Chart.js with the pieces the dashboard uses registered, and the theme's font. */
export function loadChart(): Promise<typeof import('chart.js').Chart> {
  loading ??= import('./chart-setup').then(({ Chart }) => {
    Chart.defaults.font.family = token('--font-sans') || 'sans-serif'
    Chart.defaults.color = token('--color-on-surface-variant')
    return Chart
  })
  return loading
}

/** A design token's value, such as `--color-primary`. */
export function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

/** Whether to skip chart animations. */
export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches

/** A hex colour with an alpha, for canvas fills. */
export function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = rgb(hex)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/** The colour `share` (0–1) of the way from one hex colour to another. */
export function mix(from: string, to: string, share: number): string {
  const a = rgb(from)
  const b = rgb(to)
  const channel = (index: number) => Math.round(a[index]! + (b[index]! - a[index]!) * share)
  return `rgb(${channel(0)}, ${channel(1)}, ${channel(2)})`
}

function rgb(hex: string): [number, number, number] {
  const value = hex.replace('#', '')
  return [0, 2, 4].map((at) => parseInt(value.slice(at, at + 2), 16)) as [number, number, number]
}

/** The gap between a tooltip and the point it reads, in pixels. */
const TOOLTIP_GAP = 8

/**
 * Chart.js tooltip options that draw it as HTML over the chart, in the M3 plain tooltip's
 * colours, instead of on the canvas, so a short chart never clips it. It sits above the point,
 * or below when there's no room, and stays within the chart's width. The chart's wrapper must
 * be `relative`; the tooltip is hidden from screen readers, which get the chart's own label.
 */
export function htmlTooltip() {
  return {
    enabled: false,
    external: ({ chart, tooltip }: { chart: ChartType; tooltip: TooltipModel<never> }) => {
      const host = chart.canvas.parentElement
      if (!host) return
      let box = host.querySelector<HTMLElement>(':scope > [data-chart-tooltip]')
      if (!box) {
        box = document.createElement('div')
        box.dataset.chartTooltip = ''
        box.setAttribute('aria-hidden', 'true')
        box.className =
          'pointer-events-none absolute top-0 left-0 z-10 flex flex-col rounded-xs bg-inverse-surface px-2 py-1 whitespace-nowrap text-inverse-on-surface shadow-level2 transition-opacity duration-150'
        host.append(box)
      }
      if (tooltip.opacity === 0) {
        box.style.opacity = '0'
        return
      }

      const line = (text: string, className: string) => {
        const span = document.createElement('span')
        span.className = className
        span.textContent = text
        return span
      }
      box.replaceChildren(
        ...tooltip.title.map((text) => line(text, 'text-label-small opacity-80')),
        ...tooltip.body.flatMap((item) =>
          item.lines.map((text) => line(text, 'text-label-large tabular-nums')),
        ),
      )

      const width = box.offsetWidth
      const height = box.offsetHeight
      const left = Math.min(Math.max(tooltip.caretX - width / 2, 0), host.clientWidth - width)
      const above = tooltip.caretY - height - TOOLTIP_GAP
      const top = above >= 0 ? above : tooltip.caretY + TOOLTIP_GAP
      box.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`
      box.style.opacity = '1'
    },
  }
}

/** Highlights one mark and shows its tooltip, as hovering it would; for keyboard reading. */
export function showActive(chart: ChartType, datasetIndex: number, index: number): void {
  const active = [{ datasetIndex, index }]
  const element = chart.getDatasetMeta(datasetIndex).data[index]
  chart.setActiveElements(active)
  chart.tooltip?.setActiveElements(active, { x: element?.x ?? 0, y: element?.y ?? 0 })
  chart.update()
}

/** Clears what `showActive` highlighted. */
export function clearActive(chart: ChartType | null): void {
  if (!chart) return
  chart.setActiveElements([])
  chart.tooltip?.setActiveElements([], { x: 0, y: 0 })
  chart.update()
}
