---
name: charts
description: How to draw dashboard charts in Plana with Chart.js (loadChart, chart-setup registration, theme colours, htmlTooltip, matrix grids, accessibility). Use when adding or changing any chart.
---

## Charts

Every chart is drawn with Chart.js; don't hand-roll SVG charts. See `TrendChart.vue` (line),
`ChannelShare.vue` (stacked bar), and `ActivityHeatmap.vue` and `ActivityStrip.vue` (grids, via
`chartjs-chart-matrix`) for the pattern.

- Get Chart.js from `loadChart()` in `src/lib/charts.ts`, and only from the browser
  (`onMounted` or a watcher on the canvas ref). It draws on a canvas, so it must never run
  during SSR, and it loads lazily so pages without a chart don't pay for it.
- Register any new controller, element, scale or plugin in `src/lib/chart-setup.ts`. Only
  what's registered there gets bundled.
- Canvas can't read CSS variables: take colours from the theme with `token('--color-…')`.
  One-hue charts use `--color-primary`; charts whose series are different things use
  `--color-chart-1` to `-4` in order, then `--color-chart-other` (validated as a set; see the
  note in `src/assets/main.css`). Turn animation off when `reducedMotion()`.
- Spread `htmlTooltip()` into the tooltip options: it draws the tooltip as HTML so short charts
  don't clip it. The canvas's wrapper must be `relative`.
- For keyboard reading, `showActive(chart, dataset, index)` and `clearActive(chart)`.
- Matrix (grid) charts: set `offset: false` on both scales, since the plugin turns it on and
  that squeezes the cells, and size cells with `scaleStep()`, not the chart area.
- Destroy the chart in `onBeforeUnmount`.
- Keep charts accessible: a focusable wrapper with an `aria-label` and arrow-key reading, plus
  a visually hidden table of the same numbers.
