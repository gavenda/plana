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

See `src/server/CLAUDE.md` (loads when working under `src/server`).

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

## Dashboard components come from tailwind-material3

Buttons, cards, lists, fields, chips, dialogs, sheets, the snackbar and the rail are
[tailwind-material3](https://github.com/gavenda/tailwind-material3)'s, installed from GitHub
(`bun update tailwind-material3` pulls its latest commit). Don't hand-roll one in `main.css`;
see the Components section of BRANDING.md for which to use and Plana's own wrappers.

- Its components use Tailwind's default radii (`rounded-lg`, `rounded-2xl`), so Plana's markup
  uses the M3-named ones instead: `rounded-small`, `rounded-medium`, `rounded-large`…
- vue-tsc loses the template's scope after a static attribute containing `//` on a component
  (`placeholder="https://"`, `href="https://…"`), reporting "Cannot find name" on later lines.
  Put the URL in a script constant and bind it.

## Charts

Use the `charts` skill (`.claude/skills/charts/SKILL.md`) before adding or changing a chart.

## Checks

- `bun run format` and `bun run type-check` before calling a change done. CI runs both.
