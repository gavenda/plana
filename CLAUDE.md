# Plana

Discord admin bot with a Vue + Tailwind SSR dashboard, run on Bun.

## Docs

- [FEATURES.md](FEATURES.md): what the bot and dashboard do, page by page. Read it before
  adding a feature; update it when a change alters what they do.
- [BRANDING.md](BRANDING.md): the design system (Material 3 Expressive colours, type, shape,
  motion, components) and Plana's voice. Read it before changing anything on the dashboard.

## Strings go in the locale file

Any text the bot sends to Discord (replies, embeds, buttons, modal labels, slash-command
names, descriptions and choices, fallback names, audit-log reasons) belongs in
`src/server/locales/en.json`, never inline in the code. Read it with `tl(key, locale, …)` using
the interaction's locale, or `t(key)` where there is none; lists use `tlList`, and plurals use
`_one`/`_other` keys.

- Slash-command definitions are built on demand (`data` is a function), because the text
  comes from the locale files loaded by `initI18n()` at startup. Don't build one at module
  scope with `t()`. `deploy-commands.ts` calls `initI18n()` itself for the same reason.
- Not covered: logs, startup errors, SQL, and the dashboard's own text (the Vue app and the
  HTTP API's error messages have no i18n layer).
- Messages the bot posts to a channel on its own (welcome, leave, birthday, recap, game
  night, triage reminder) open with a `-#` subtext heading naming the message, such as
  `-# Leave Announcement\n…`. Give any new one the same. Private replies that are a card
  or a list (`/stats`, `/birthday upcoming`) get one too; one-line confirmations and
  errors don't, and neither does `/broadcast` (the admin's own text).

## Slash commands, buttons and modals

- A slash command is one file, `src/server/commands/chat-input/<name>.command.ts`, exporting
  an `AppChatInputCommand` named `<name>Command`. It has a `name`, a `data()` that builds the
  `SlashCommandBuilder` and ends in `.toJSON()`, and an `execute(context, interaction)`.
  Add it to the list in `commands/chat-input/index.ts`; that list is both registered with
  Discord and used to route interactions by `name`.
- Commands in a member's Apps menu (right-click) work the same way, in
  `src/server/commands/user/` as `AppUserCommand`s built with `ContextMenuCommandBuilder`.
  They're routed by their display name, so `name()` reads the same locale key as `data()`.
  Both lists are registered together through `getCommandData()` in `commands/index.ts`.
- Its text goes under `command.<name>` in the locale file (description, option descriptions,
  choices). The text of its replies goes under a key of its own, such as `about.*` or
  `stats.*`.
- Limit who can use a command with `setDefaultMemberPermissions` (usually
  `Administrator`), and don't re-check in `execute` or in its modal: servers widen it
  under Integrations on purpose. Buttons on public messages do check, with `isStaff` or
  `isAdministrator`.
- Reply with the interaction's locale (`tl(…, interaction.locale)`). Make replies
  `MessageFlags.Ephemeral` unless the command exists to post publicly (`/broadcast`).
  `deferReply` first if the work could take more than 3 seconds.
- Don't use deprecated discord.js APIs; their typings mark them `@deprecated`. For example,
  modals take `LabelBuilder`s through `addLabelComponents`, not action rows through
  `addComponents`, and inputs get their label from the `LabelBuilder`, not `setLabel`.
- Rich replies use Components v2 (`MessageFlags.IsComponentsV2`) with top-level sections,
  text displays and separators, no container. See `about.command.ts` and `discord/stats.ts`.
- Buttons and modals live in `src/server/handlers/buttons` and `handlers/modals`, as
  `<name>.handler.ts` exporting an `AppButtonHandler` or `AppModalSubmitHandler`, listed in that
  folder's `index.ts`. They're routed by the `custom_id` prefix before the first `:`. Build
  and parse the `custom_id` with the `encode…`/`decode…` helpers in
  `src/server/discord/ids.ts`, since the ID is the only state Discord sends back.
- Add the command to [FEATURES.md](FEATURES.md). New commands reach Discord when the bot
  restarts or on `bun run commands:deploy`.

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
