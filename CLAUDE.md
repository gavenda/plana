# Plana

Discord admin bot with a Vue + Tailwind SSR dashboard, run on Bun.

## Docs

- [FEATURES.md](FEATURES.md): what the bot and dashboard do, page by page. Read it before
  adding a feature; update it when a change alters what they do.
- [BRANDING.md](BRANDING.md): the design system (Material 3 Expressive colours, type, shape,
  motion, components) and Plana's voice. Read it before changing anything on the dashboard.

## Adding an icon (easy to forget)

The dashboard's icon font, Material Symbols Rounded, is subset to the icons in use. A name
missing from the list doesn't fail the build or the type check: it renders as its own name in
plain text (a card showing "trending_up" instead of an arrow).

Whenever you use an icon name anywhere (a template's `<span class="icon">`, an `icon: '…'`
field, a helper like `auditIcon` in `src/lib/audit.ts`):

1. Open `index.html` and find the Material Symbols `<link>` (under "Only the icons the
   dashboard uses").
2. Add the name to its `icon_names=` list, comma-separated, **keeping the list sorted
   alphabetically**. Google rejects an unsorted list.
3. Names are the ligatures from https://fonts.google.com/icons, in snake_case.

To list icons used in `src` but missing from `index.html`:

```sh
comm -23 \
  <({ grep -rhoE 'class="[^"]*\bicon\b[^"]*"[^>]*>\s*[a-z_0-9]+\s*<' src | grep -oE '>\s*[a-z_0-9]+\s*<' | tr -d '<> '
      grep -rhoE "\bicon:\s*'[a-z_0-9]+'" src | grep -oE "'[a-z_0-9]+'" | tr -d "'"; } | sort -u) \
  <(grep -oE 'icon_names=[^&"]+' index.html | cut -d= -f2 | tr , '\n' | sort -u)
```

It prints nothing when every icon is listed. It can't see names returned by functions (such
as `auditIcon`), so check those by hand.

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

## Checks

- `bun run format` and `bun run type-check` before calling a change done. CI runs both.
