# Branding

Plana is named after Plana (プラナ), the operating system of the Shittim Chest in the game
Blue Archive: the tablet's other OS, "Arona from another timeline", who now lives in
Sensei's Shittim Chest. What makes the app look and sound like itself is taken from her:
its colours are her coat, her hair and her halo; her face is on its empty screens, its
confirmation dialogs and its sign-in panel; her halo is its loading indicator; and its
text is written as a system administrator reporting to the person in charge.

> **The dashboard's design system is [Material 3 Expressive](https://m3.material.io/).**
> When a design question isn't answered here, follow the M3 guidelines and component
> specs at <https://m3.material.io/components>. Components are built with Tailwind CSS,
> not a Material component library.

All tokens and shared components live in [`src/assets/main.css`](src/assets/main.css).
Views use those tokens as Tailwind utilities; no component has a `<style>` block.

## In short

1. **The theme is hers.** Three colours sampled from her art: the navy of her coat as the
   seed, the lilac of her hair as `secondary`, the pink of her halo as `tertiary`. Dark
   scheme only.
2. **Plana speaks as "I". A signed-in administrator is "Sensei".** On the dashboard only:
   members in Discord are never called Sensei. She is terse and formal, and never
   exclaims.
3. **Her face is for a screen with nothing to show, a page that failed to load, a
   confirmation dialog, the sign-in panel, the 404 panel, the phone notice and About.**
   It is never beside a figure, a list row, a form field or a chart. The one place she
   appears in full, outside a badge, is [the sign-in scene](#the-sign-in-scene).
4. **A badge masks her.** She stands in M3's 9-sided cookie in `primary-container`, the
   navy of her coat. She is cut off at its edge from its middle down, and her head, ribbon
   and halo flow out past it. Her eyes are its horizontal centre.
5. **Her halo carries her mood.** Each portrait keeps the halo drawn with that face, so a
   mood is chosen for its halo as much as its face. A broken halo means something is
   wrong.
6. **Every image comes from one script**, `scripts/brand_assets.py`, and no image is
   edited by hand.

## Names

The app and the character have the same name, told apart by where it is used.

**Plana** is the app: the name beside the logo in the expanded rail,
in the page title ("Overview · Plana") and on the bot's Discord profile.

**Plana** is also the character. Where the text has someone doing the work, it is her, and
she says "I". The app never calls itself "the bot" in its own voice; error messages that
explain a Discord permission problem may, since there "the bot" is the Discord account
being configured.

## Who Plana is

Her [wiki page](https://bluearchive.wiki/wiki/Plana) gives the facts, her
[audio page](https://bluearchive.wiki/wiki/Plana/audio) gives how she speaks, and her
[story appearances](https://bluearchive.wiki/wiki/Plana/story) show how she behaves.

- She is the main OS and system administrator of the Shittim Chest, the tablet that
  belonged to Phrenapates. After Vol. F she lives in Sensei's Shittim Chest, alongside
  Arona. Her affiliation is Schale.
- She was designed by DoReMi and is voiced by Kohara Konomi. The wiki lists no birthday,
  so the app celebrates none for her.
- She speaks like a system reporting status: "Connection confirmed.", "Verification
  complete.", "Standing by. Please issue your commands, Sensei."
- She greets by name and title: "Welcome, [USERNAME] Sensei.", "[USERNAME] Sensei. I've
  been waiting for you."
- She is short and literal, and trails off when something is new to her: "This place
  is...", "...I see.", "Hmm... That's how it works."
- She is deadpan about her own confusion: "I'm confused. I don't understand this
  behavior... Please don't poke me or I'll break down."
- Under the flatness she is attached to Sensei, and asks quietly rather than objecting:
  "You mean that?"
- Her halo changes with her mood, through shades of red and pink: a clean ring at rest,
  glitched streaks when unsettled, shards when alarmed, a heart when touched.

[Voice](#voice) says which of these the text draws on.

## Platform

- **Tablets and desktops only.** Phones are not supported. Below the M3 _medium_ window
  class (600px wide), or on a touch screen under 480px tall (a phone held landscape), the
  app is hidden and a "Phones aren't supported" screen is shown instead
  ([`PhoneNotice.vue`](src/components/PhoneNotice.vue)). It is driven by the `phone:`
  Tailwind variant, so it is correct on the first server-rendered paint.
- Don't add compact (phone) layouts, bottom navigation bars, or navigation drawers.
- **Navigation is a navigation rail** ([`AppNavigationRail.vue`](src/components/AppNavigationRail.vue),
  [`RailItem.vue`](src/components/RailItem.vue)), built the way Yuuka's is: slim (96dp, icon
  over label) by default, and open (icon beside label) from the menu button, as wide as its
  content needs between 220 and 360dp. Both states are one structure that morphs (see
  [Motion](#motion)). The open rail adds "Sign out" under the destinations and an account card
  (avatar, display name, username) at its foot. From 840px it pushes the page aside; below
  that it floats over the page behind a scrim and closes after a choice. The choice is
  remembered per browser, and only restored where it docks.
- **There is no top app bar.** The rail shows where you are, so each page has a heading for
  screen readers only. Overview is the exception: her greeting is its visible heading, with
  the server's name and member count under it.
- Layout breakpoints use the M3 window size classes: `medium:` (600px), `expanded:`
  (840px), `large:` (1200px), `extra-large:` (1600px).

## Colour

One theme, dark only, the same for everyone. It is the M3 tonal spot scheme at default
contrast, built with Google's `@material/material-color-utilities` 0.3.0 from three
colours sampled from her art (`Plana_Portrait_Expression_1.webp`):

| Input      | Value     | Taken from                 | Becomes                             |
| ---------- | --------- | -------------------------- | ----------------------------------- |
| Seed       | `#283050` | Her coat, in shade         | `primary`, the surfaces and `error` |
| Hair lilac | `#F0E0F8` | Her hair, towards the tips | `secondary`                         |
| Halo pink  | `#FF6CB3` | The light band of her halo | `tertiary`                          |

The seed goes through the tonal spot style. The other two are given as palettes of their
own (`TonalPalette.fromInt`), so they keep their own hue and chroma. The halo's deep red
(`#FF023A`) was not used: its container came out within a shade of `error-container`.
Error keeps M3's own red.

| Role                                                                 | Value                                         |
| -------------------------------------------------------------------- | --------------------------------------------- |
| `primary` / `on-primary`                                             | `#B7C4FF` / `#1E2D61`                         |
| `primary-container` / `on-primary-container`                         | `#364479` / `#DCE1FF`                         |
| `secondary` / `on-secondary`                                         | `#D0C1D8` / `#362D3E`                         |
| `secondary-container` / `on-secondary-container`                     | `#4D4356` / `#EDDDF5`                         |
| `tertiary` / `on-tertiary`                                           | `#FFB0CF` / `#63003C`                         |
| `tertiary-container` / `on-tertiary-container`                       | `#8B0256` / `#FFD8E5`                         |
| `surface`                                                            | `#121318`                                     |
| `surface-container-low` / `surface-container` / `-high` / `-highest` | `#1A1B21` / `#1E1F25` / `#292A2F` / `#34343A` |
| `on-surface` / `on-surface-variant`                                  | `#E3E1E9` / `#C6C5D0`                         |
| `outline` / `outline-variant`                                        | `#90909A` / `#45464F`                         |
| `inverse-primary`                                                    | `#4E5B92`                                     |

The roles in `main.css` are this output written out, and are regenerated from the three
inputs when one changes, never edited one at a time. The custom `success-*` and
`warning-*` colours are harmonized with the seed, as M3 custom colours are.

- **Navy (primary)** is the default accent: filled buttons, links, the badge behind her
  portrait, the logo's ground.
- **Lilac (secondary)** is navigation and selection: the active rail destination, tonal
  buttons, focus outlines.
- **Halo pink (tertiary)** is for what wants a glance without being good or bad: the third
  stat tile on Overview, today's birthdays (`.chip-tertiary`), the selected item in a menu,
  her name in About, and her halo wherever it is drawn in code.

| Use                                    | Roles                                                                |
| -------------------------------------- | -------------------------------------------------------------------- |
| Page background, rail                  | `surface` / `on-surface`                                             |
| Open rail floating over the page       | `surface-container`, `shadow-level2`, a 32% `scrim` behind           |
| Account card in the open rail          | `surface-container-highest`                                          |
| Cards, segmented list items            | `surface-container`                                                  |
| Avatar placeholders                    | `surface-container-highest`                                          |
| Sign-in and 404 panels                 | `surface-container-low`                                              |
| Dialogs                                | `surface-container-high`                                             |
| Secondary text, icons, list headers    | `on-surface-variant`                                                 |
| Field borders                          | `outline`; dividers use `outline-variant`                            |
| Main action                            | `primary` / `on-primary`                                             |
| Active rail destination, tonal buttons | `secondary-container` / `on-secondary-container`                     |
| Emphasis tiles and chips               | `primary-`, `secondary-`, `tertiary-container` and their `on-` roles |
| Her portrait's badge                   | `primary-container`                                                  |
| Her speech bubble                      | `surface-container-highest` / `on-surface`                           |
| Errors                                 | `error`, `error-container` / `on-error-container`                    |
| Success and warning                    | custom colors `success-*` and `warning-*`, same role structure as M3 |

**Discord's own colours** are the exception to the theme: anything from Discord looks as it
does in Discord.

- **Mentions** (`DiscordMention`): a role is `@name` in its role colour on a 16% wash of it
  (roles without a colour take `secondary`); a channel (`#name`) or a user (`@name`, and
  `@everyone`/`@here`) is in Discord's blurple (`.mention-blurple`). Audit summaries draw
  their roles, channels and people this way (`AuditSummary`), looking up current names by id.
- **Member names** in lists (Triage, Overview, Birthdays) take the member's display colour,
  their highest coloured role, as Discord's member list does. The server sends it as `color`.
- **On a button or in a menu** the colour is a dot beside the name instead: the Triage
  assign buttons, and `AppSelect` options with a `swatch` (Settings' roles, the Birthdays
  member picker).
- **The Broadcast preview** (`DiscordMessage`) draws channel and role mentions, `@everyone`,
  `@here` and custom emoji as Discord will. User mentions (`<@id>`) stay as typed.

Every Discord colour used as text is mixed 20% towards `on-surface` (`discordTextColor`), so
a dark role colour still reads on the dark theme.

Use roles, never raw hex values in markup. Disabled content is `on-surface` at 38%,
disabled containers `on-surface` at 12% (`text-on-surface/38`, `bg-on-surface/12`), as
in M3. The `theme-color` meta in `index.html` is `surface`.

## The logo and icons

The logo is her `Standby` face, close in and without the halo, on a circle in the navy
of her coat, so it still reads at 16px (`src/assets/plana/logo.webp`, 128px). It is
always a circle: the cookie is for her portraits.

**In the navigation rail** the logo is the app's mark, at 40dp at the top of the rail in
both states, with "Plana" and the version beside it once the rail is open. The menu
button sits on its own row beneath it, as M3 places it; nothing goes beside the menu
button. The mark is not a link or a control (Overview is the way home), and is hidden from
screen readers.

| Where                    | What                                                                                                                                                                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| The bot's Discord avatar | The logo at 1024px, written to `branding/out/discord-avatar.png` and uploaded by hand in the Developer Portal.                                                                                                                 |
| Browser tab              | The bot's Discord avatar itself. `/favicon.ico` redirects to it (`src/server/http/app.ts`), so a new avatar in the Developer Portal is the new favicon, an hour later at most. It 404s until the bot has connected to Discord. |

The app has no wordmark beyond her name in the type.

## Plana's portraits

`PlanaPortrait` (`src/components/PlanaPortrait.vue`, moods in `src/lib/plana.ts`) shows
her from the chest up in a badge: M3's 9-sided cookie in `primary-container`, nine rounded
lobes with one pointing up, drawn as an SVG so it takes the theme's colour. The badge
masks her. From its middle down she is cut off at its edge, and above it her head, her
ribbon and her halo flow out past it, the ribbon well beyond its left side. The cookie is
centred on her eyes. The badge is 128px wide everywhere she appears, and has no other
size; the whole portrait is 9/7 of that wide and 19/14 of it tall, to make room for what flows out. She is
hidden from screen readers (`alt=""`), since the words beside her say what the screen has
to.

`PlanaSays` puts her portrait beside a speech bubble (`SpeechBubble`): a `rounded-lg`
container in `surface-container-highest` with a tail towards her, `text-body-large`.
Her line goes in the bubble; anything the reader has to act on goes outside it, in plain
text or a button.

### Where she appears

She is in these places and nowhere else.

| Place                                                      | Mood        | Size | Her line                                                 | Plain text alongside                        |
| ---------------------------------------------------------- | ----------- | ---- | -------------------------------------------------------- | ------------------------------------------- |
| **Sign-in panel**, in place of the "P" tile                | `Standby`   | 128  | Standing by. Please verify your identity.                | The button, and nothing else                |
| **Sign-in failed**, `forbidden`                            | `Stern`     | 128  | Verification failed. I can't let you in.                 | The reason, in the error alert              |
| **Sign-in failed**, any other code                         | `Uneasy`    | 128  | That didn't connect. Please try again.                   | The reason, in the error alert              |
| **404 panel**                                              | `Puzzled`   | 128  | This place is... I see. There's nothing here.            | "Back to overview"                          |
| **Phone notice**, in place of the devices icon             | `Uneasy`    | 128  | —                                                        | The existing headline and text              |
| **Triage queue, empty**                                    | `Asleep`    | 128  | Standing by. No one is waiting in triage.                | —                                           |
| **Birthdays, none saved**                                  | `Curious`   | 128  | No birthdays yet. I'll remember each one I'm told.       | "Members add theirs with `/birthday set`."  |
| **Audit log, empty**                                       | `Standby`   | 128  | Nothing to report. I'll record every change here.        | —                                           |
| **A page that failed to load** (`StateBlock` with `error`) | `Confused`  | 128  | I'm confused... This didn't load.                        | The reason, plain, and a "Try again" button |
| **Sign-out dialog**                                        | `Hesitant`  | 128  | — (see [Dialogs](#dialogs))                              |                                             |
| **Remove birthday dialog**                                 | `Attentive` | 128  | — (see [Dialogs](#dialogs))                              |                                             |
| **About**, at the foot of Settings                         | `Content`   | 128  | Connection confirmed. I've been waiting for you, Sensei. | "Plana 1.0.0", then the credits             |

Where she is not, on purpose:

- **Small empty messages in place of a short list**, such as Overview's "Nobody is waiting."
  and "No activity recorded.", stay plain text. Overview is figures, and she is never beside one.
- **Alerts after an action** ("Settings saved.", "Discord rejected the role change.") stay
  plain banners. Her face is for a state the screen is in, not a reply to a click.
- **Loading.** Her halo stands for her (see [The halo](#the-halo)); her face does not.
- **The rail's destinations, lists, forms, the broadcast preview.**

### About

The last thing in Settings (beside the form on large windows, below it otherwise), with no
card and no heading: `PlanaSays` with her `Content` face and her line, then "Plana" with the version (`package.json`) underneath. Under the
version are two plain lines in the third person: "Kept by Plana, system administrator of
the Shittim Chest", with her name alone in `tertiary`, and, quieter, "Character design by
DoReMi, from Blue Archive."

### Moods

Twenty-one faces are in the sources, each with its own halo. Ten are cut. A new place
picks from these first, by face and by halo.

| Mood        | Face                          | Halo             | Source | Used for                                 |
| ----------- | ----------------------------- | ---------------- | ------ | ---------------------------------------- |
| `Standby`   | Level, neutral                | Ring             | 1      | Sign-in panel, Audit log empty, the logo |
| `Content`   | One eye closed, a small smile | Ring             | 16     | About                                    |
| `Attentive` | Eye wide, mouth set           | Ring             | 8      | Remove birthday dialog                   |
| `Curious`   | A sparkle in her eye, a blush | Ring with sparks | 9      | Birthdays empty                          |
| `Asleep`    | Eye closed, calm              | Ring             | 99     | Triage queue empty                       |
| `Hesitant`  | A blush, lips parted          | Ring             | 18     | Sign-out dialog                          |
| `Uneasy`    | A bead of sweat               | Warped           | 7      | Sign-in failure, phone notice            |
| `Puzzled`   | Eye narrowed                  | Glitched         | 6      | 404                                      |
| `Confused`  | A spiral eye, flustered       | Glitched         | 13     | A page that failed to load               |
| `Stern`     | A frown                       | Shattered        | 11     | Sign-in refused (not an administrator)   |

Not cut: 2 neutral, lips apart; 3 a faint smile; 4 sweat, glitched halo; 5 surprised "o",
shattered halo; 10 shouting, shattered halo; 12 troubled, glitched halo; 14 a ">" wink,
warped halo; 15 speaking; 17 eyes closed and blushing, a **heart halo**; 19 shadowed
eyes, shattered halo; 20 shadowed eyes, mouth open, glitched halo.

Rules for halos:

- **Shattered halos (5, 10, 11, 19) mean alarm.** Only `Stern` ships one, for a refused
  sign-in. Don't use another for anything an administrator caused by mistake.
- **The heart halo (17)** is kept for a moment of affection towards Sensei. Nothing
  ships it yet; it is the first choice if one is added.
- A ring halo is the default. Prefer it unless the moment is uneasy.

### Cutting a new mood

The sources are lossless PNGs, all in one pose, so one box serves every face. The boxes
are measured in the pixels of the older 1000×1905 WebPs; the script maps them onto the
PNGs (`PNG_SCALE`, `PNG_OFFSET`) and resamples each cut once, straight to its final size.

1. Add the mood and its source number to `MOODS` in `scripts/brand_assets.py`.
2. Run `python3 scripts/brand_assets.py`, which needs Pillow. It cuts a 720×760 canvas
   from the top of the source, centred on her eyes (`EYES_X`, 536): the midpoint between
   her visible pupil and the one under her fringe, mirrored across her nose. The badge is
   a 560px square in it, 200px down, so its middle sits just under her eyes, and the
   canvas around it holds her ribbon and halo. It masks her to the cookie below that
   middle and saves the canvas at 360×380 as WebP to `src/assets/plana/<mood>.webp`,
   which Vite fingerprints and serves.
3. Add it to `PlanaMood` in `src/lib/plana.ts`.

The cookie's outline is the same formula in the script (`cookie9`) and the component
(`cookiePath`), and the canvas and badge sizes are written in both; change them together.
The same script writes the logo and the Discord avatar, so a change to a crop is a change
to the script and a re-run.

## The halo

Her halo, redrawn in code as a tilted ellipse (`HaloMark.vue`), stroked in `tertiary`.

- **It is the loading indicator.** `StateBlock`'s spinner is replaced by the halo at
  32dp, with a brighter band (`on-tertiary-container`) travelling round it once a
  second, linear. The text beside it is "Processing…". With `prefers-reduced-motion` the
  band stops and the ring holds still.
- **Buttons that wait** (Assign, Send, Save) keep their label and disable; they don't get
  a halo.
- It is never decoration: not a bullet, a divider or a background. It always means "Plana
  is working".

The halo in a portrait is part of the art and changes with the mood. `HaloMark` is only
ever the ring.

## The Schale mark

The emblem of Schale, her affiliation (`branding/Schale_Icon.webp`): a halo over a
compass ring with a cross-hair. Redrawn as a single-colour SVG (`SchaleMark.vue`), it
appears in one place: the footer of the stand-alone pages (sign-in and 404), centred at
the bottom of the window, 96px wide in `on-surface-variant` (`App.vue`). It never carries
meaning, and never goes behind a panel, a list, a form or her portrait's badge.

## The backdrop

A seaside scene at dusk, desks washed up along the shore (`branding/BG_CS_PV4_161_2.jpg`),
from Blue Archive. It is behind the stand-alone pages only (sign-in and 404), covering the
window at 16% opacity over `surface`, so it tints the page lilac and blue without
competing with the panel. `scripts/brand_assets.py` saves it as
`src/assets/plana/backdrop.webp` (1600px wide). It never goes behind the dashboard itself.
From the _large_ window class up (1200px), the sign-in page shows
[its scene](#the-sign-in-scene) instead.

## The sign-in scene

Three frames from Blue Archive of her in an empty classroom, checking a fingerprint
(`branding/BG_CS_StudentCouncil_03_*.jpg`). In order: she looks at you (`_1`), raises a
finger (`_3`), and a scan grid comes up around it (`_2`). `scripts/brand_assets.py` saves
them as `src/assets/plana/scene-look.webp`, `scene-raise.webp` and `scene-scan.webp`
(1600px wide).

- **Where.** The sign-in page only, from the _large_ window class up. The frames fill the
  left of the window, inset 24px and in `rounded-3xl`, and the panel and Schale's emblem
  move to a column on the right (`--spacing-scene-panel`). Below _large_ the scene is
  hidden and the page is the centred panel over the backdrop, as on 404.
- **At rest** she is on `look`, whatever the panel says, sign-in failures included. The
  panel's badge keeps carrying her mood.
- **Signing in is a hold**, like a finger held to a scanner. Pressing the button plays the
  check: `raise`, then `scan` 350ms later, each fading in over 300ms (`ease-effects-slow`)
  on top of the frame before, and her line is "Verifying. Please hold still." Meanwhile
  the button fills left to right in `on-primary` at 24%. Held for 2.5s (`HOLD_MS`), the
  browser leaves for Discord. Let go sooner and the fill drains in 200ms, and she turns
  back to `look`, as after a failed sign-in, in `Uneasy`: "Verification interrupted.
  Please hold until I finish." A keyboard can't hold, so Enter plays the check through.
  With reduced motion, or with the scene hidden, the button is an ordinary link.
- Nothing is drawn over the art. It is decorative and hidden from assistive tech.

## Dialogs

Dialogs are M3 basic dialogs (`AppDialog`, a native `<dialog>` for focus trapping and
Escape): `rounded-xl` on `surface-container-high`, `shadow-level3`, a `scrim` at 32%,
280–560dp wide, headline `text-headline-small`, supporting text `text-body-medium` in
`on-surface-variant`, text buttons at the end. It opens on `ease-spatial` (scale from 90%
and fade) and closes on `ease-effects`.

**A confirmation dialog shows her in the hero slot**, above a centred headline, as M3's
hero icon. A dialog that holds a form or a list has no hero and no face. **Never use
`window.confirm`**: like a native `<select>`, the browser draws it.

| Dialog                        | Mood        | Headline         | Supporting text                                             | Buttons         |
| ----------------------------- | ----------- | ---------------- | ----------------------------------------------------------- | --------------- |
| Sign out (from the open rail) | `Hesitant`  | You mean that?   | I'll be standing by until you return, Sensei.               | Stay · Sign out |
| Remove a birthday             | `Attentive` | Remove birthday? | {member}'s birthday will be deleted and won't be announced. | Cancel · Remove |

Only the sign-out dialog speaks in her voice: it is about Sensei leaving her. A
destructive confirmation states the consequence plainly, and her face is there to look
at the person deciding, not to persuade them.

## Typography

The M3 type scale as Tailwind font-size utilities, each carrying its line height,
tracking and weight: `text-display-{large,medium,small}`, `text-headline-*`,
`text-title-*`, `text-body-*`, `text-label-*`. Don't use pixel sizes (`text-[13px]`).

The face is **Roboto Flex** (with Roboto Mono for usernames and code), loaded from Google
Fonts in `index.html`. For Expressive emphasis on a hero number or headline, raise the
weight (`font-medium`) rather than inventing a size.

## Shape

The M3 shape scale replaces Tailwind's default radii:

| Utility                 | M3 token              | Size            | Used for                                                                                  |
| ----------------------- | --------------------- | --------------- | ----------------------------------------------------------------------------------------- |
| `rounded-xs`            | extra small           | 4px             | text fields, menu items                                                                   |
| `rounded-sm`            | small                 | 8px             | chips, pressed buttons                                                                    |
| `rounded-md`            | medium                | 12px            | pressed icon and medium buttons, selected menu item                                       |
| `rounded-lg`            | large                 | 16px            | banners, menus, speech bubbles                                                            |
| `rounded-xl`            | extra large           | 28px            | cards, stat tiles, dialogs                                                                |
| `rounded-2xl`           | extra large increased | 32px            | hovered stat tiles                                                                        |
| `rounded-3xl`           | extra extra large     | 48px            | sign-in and 404 panels                                                                    |
| `rounded-full`          | full                  | —               | rail indicators, avatars, the logo                                                        |
| `rounded-full-<height>` | full                  | half the height | anything that morphs from round: buttons at rest (32, 40, 56), date picker cells (36, 40) |

Her portrait's badge is the one shape outside this scale: M3 Expressive's 9-sided cookie
(see [Plana's portraits](#planas-portraits)).

**Shape morphing** is the Expressive signature: buttons are pill-shaped at rest and
square off to `rounded-sm` while pressed (`rounded-md` for the 56px `.btn-md`); clickable
stat tiles round further on hover. Animate radius changes on the spatial spring.

A shape that morphs from round takes `rounded-full-<height>`, never `rounded-full`.
Tailwind's `rounded-full` is an infinite radius, which can't be animated: a press holds
round and then snaps square, and a release jumps straight back. A new height gets its own
`--radius-full-<height>` token in `main.css`.

## Motion

Expressive springs, approximated as cubic-bézier curves (`ease-*` utilities):

| Utility             | Duration | Use                                       |
| ------------------- | -------- | ----------------------------------------- |
| `ease-spatial-fast` | 350ms    | buttons, small shape morphs               |
| `ease-spatial`      | 500ms    | dialogs opening, larger layout moves      |
| `ease-spatial-slow` | 650ms    | full-screen transitions                   |
| `ease-effects-fast` | 150ms    | state layers, hover tints                 |
| `ease-effects`      | 200ms    | color changes, icon fill, dialogs closing |
| `ease-effects-slow` | 300ms    | fades                                     |

The navigation rail is the exception, and moves as Yuuka's does: M3's emphasized decelerate
curve over 300ms (`ease-emphasized-decelerate`) for the rail's width, the page moving aside,
and every item's pill, icon and label, so they all land together without overshoot. Things
that come and go with the open rail (the name, the menu glyph, "Sign out", the account card)
fade on `ease-standard`, 150ms out and 200ms in after a 100ms beat; groups grow from zero
height rather than appear. The scrim fades in on `ease-standard-decelerate` and out on
`ease-standard-accelerate`. The rules live under "navigation rail" in `main.css`.

Spatial curves overshoot (they move and resize things); effects curves never overshoot
(they change color and opacity). `prefers-reduced-motion` turns transitions off. Her
portrait never moves on its own: no bobbing, blinking or idle animation.

## Elevation

`shadow-level1` to `shadow-level3`. In the dark scheme, tone does most of the work: lift
a surface by moving up a `surface-container-*` step first, and add a shadow only for
hovered filled/tonal buttons, floating panels and dialogs.

## Interaction

- **State layers** (`state-layer` utility): an overlay in the content color at 8% on
  hover and 10% on focus or press. Every clickable surface gets one.
- **Focus**: a 3px `secondary` outline, offset 2px.
- **Icons**: Material Symbols Rounded, outlined by default, `icon-filled` for the
  selected state. Size with `[--icon-size:20px]`. The font is subset to the icons in use,
  so add any new name to the sorted `icon_names` list in `index.html`.

## Components

Shared components in `main.css`, named after their M3 counterparts:

| Class                                                                            | M3 component                                                                                                                                                                                                                                                                                                       |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `.btn` + `.btn-filled` / `.btn-tonal` / `.btn-outlined` / `.btn-text`, `.btn-sm` | Buttons (small, and extra small with `.btn-sm`)                                                                                                                                                                                                                                                                    |
| `.icon-btn` + `.icon-btn-tonal`, `.icon-btn-danger`, `.icon-btn-narrow`          | Icon button (standard or tonal; default or narrow width). Row actions in a list are narrow tonal; one that deletes or removes adds `.icon-btn-danger` for the error colours.                                                                                                                                       |
| `.card`, `.card-header`, `.card-body`                                            | Filled card                                                                                                                                                                                                                                                                                                        |
| `.chip` + `.chip-accent` / `-tertiary` / `-success` / `-danger` / `-warn`        | Chips (non-interactive, as status labels)                                                                                                                                                                                                                                                                          |
| `.alert` + `.alert-error` / `-success` / `-warn`                                 | Banner-style inline message                                                                                                                                                                                                                                                                                        |
| `.segmented-list`, `.segmented-item`, `.segmented-header`                        | Expressive segmented list: items 2dp apart, large outer corners, extra-small inner ones, no dividers (as Yuuka's grouped rows). Used wherever rows of records would otherwise be a table: the Audit log is one per day; Triage, Birthdays, and Overview's triage and recent activity are one each. No data tables. |

Vue components, where M3 needs behaviour CSS can't give:

| Component                                           | M3 component                                                                                                                          |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| [`OutlinedField`](src/components/OutlinedField.vue) | Outlined text field container: notched outline, floating label, supporting text, counter                                              |
| [`AppSelect`](src/components/AppSelect.vue)         | Exposed dropdown menu (outlined field + menu)                                                                                         |
| [`AppTextArea`](src/components/AppTextArea.vue)     | Outlined text field, multi-line, with character counter                                                                               |
| `AppDialog`                                         | Basic dialog, with an optional hero (see [Dialogs](#dialogs))                                                                         |
| `PlanaPortrait`, `PlanaSays`, `SpeechBubble`        | Her portrait, and her portrait with a line (see [Plana's portraits](#planas-portraits))                                               |
| `HaloMark`                                          | Circular progress indicator, indeterminate, in her halo's shape                                                                       |
| `StateBlock`                                        | Loading, error and empty states around a block (see below)                                                                            |
| `SchaleMark`                                        | Schale's emblem, as a watermark (see [The Schale mark](#the-schale-mark))                                                             |
| `DiscordMention`, `AuditSummary`, `DiscordMessage`  | A role, channel or user as a Discord mention; an audit summary with its names as mentions; message text with its Discord markup drawn |

`StateBlock` shows `HaloMark` while loading. Given an `emptyMood`, its `emptyText` is her
line in a bubble, with an optional `#empty` slot for plain text under it; without one,
`emptyText` is plain. A load failure shows her `Confused` face, the reason, and "Try
again" when `retry` is passed. `compact` keeps her out, for small cards beside figures.

**Never use a native `<select>`**: its option list is drawn by the browser and can't
follow M3. Use `AppSelect` with a `SelectOption[]` list (`src/lib/select.ts`); options
can carry `trailing` text, a colour `swatch`, be `disabled`, and share a `group` to form a labelled
section (pass grouped lists through `groupOptions`).

`AppSelect` menus follow M3 Expressive menus: a `rounded-lg` container on
`surface-container-high` (one step above the cards it opens over) at `shadow-level2`,
48dp items, and the selected item filled with `tertiary-container`, given medium
corners and a check mark. The menu springs open from the field on
`ease-spatial-fast`, flips above the field when there's no room below, and follows the
WAI-ARIA select-only combobox pattern: arrow keys, Home/End, Page Up/Down,
type-ahead, Enter or Space to choose, Escape to close.

## Voice

The text reads as a system administrator reporting to the person in charge: short,
literal, polite, quietly attentive. Status first, then the instruction.

### Who is speaking

Where a line has any character in it, Plana is speaking, in the first person. On the
dashboard she speaks to a signed-in administrator, who is **Sensei**: by name where it is
known ("Welcome, Enda Sensei."), and otherwise "Sensei" alone, at most once per line and
never in a label or button. Before sign-in nobody is Sensei yet.

The two lines under the version in About are about her, and so are in the third person.

### What comes from her

- **Status reports.** "Standing by.", "Connection confirmed.", "Verification failed.",
  "Nothing to report." A line opens with the state, in two or three words, and a full
  stop.
- **The greeting.** Overview's headline is "Welcome, {displayName} Sensei.", her own line,
  in place of "Overview" (the rail and the tab still say Overview).
- **Trailing off.** An ellipsis where she meets something she doesn't understand: "This
  place is... I see.", "I'm confused..." At most one per line, never in a status report.
- **Waiting for Sensei.** "I've been waiting for you, Sensei.", "I'll be standing by
  until you return."
- **Processing.** Loading is "Processing…".

### What stays plain

Labels, page titles, rail destinations, buttons, field hints, validation messages,
confirmation headlines and their consequences, the notice that a thing was saved or
deleted, and the reason given for an error. Sentence case for every label, button and
heading. Say what happened or what to do ("Settings saved.", "Choose a channel →").

### Discord

In Discord she talks to members, who are not Sensei, so the copy in
`src/server/locales/en.json` stays mostly plain. Where she does the work for someone she
says "I", with the same status-first shape:

| Key                                 | Line                                                                  |
| ----------------------------------- | --------------------------------------------------------------------- |
| `reply.birthday_set`                | 🎂 Confirmed. I've saved your birthday as **{{date}}**.               |
| `reply.birthday_removed`            | Understood. I've forgotten your birthday.                             |
| `reply.error_interaction_execution` | I'm confused... Something went wrong handling that. Please try again. |

Announcements, triage cards and errors that name a permission stay as they are. The
emoji Discord copy already uses are kept there; the dashboard uses none.

### Left out on purpose

- Exclamation marks in her lines. She is flat, never loud.
- Arona: her name, her strawberry milk, the two of them together. Plana is here alone.
- Lore beyond her title. "Shittim Chest" appears once, in About; Phrenapates, Vol. F
  and the Multi-Floor Raid never do.
- "Sensei" in Discord, or for anyone not signed in.
- Her saying "Please don't poke me or I'll break down." It is the best line she has, and
  it would be a joke at the reader's expense on an error screen.

## Source artwork

The originals are in `/branding`, which is kept out of git (it is Blue Archive's artwork,
not the app's).

| File                               | What it is                                                                                                                                                                                                                                                                                                                                                   |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `expressions/`                     | 21 full-length portraits in one pose with different faces and halos, numbered 1 to 20 and 99, as lossless PNGs (`Plana_<nn>.png`, 1000×1920; number 1 is `Plana_00.png`) and the older lossy WebPs (`Plana_Portrait_Expression_<n>.webp`, 1000×1905, slightly smaller in frame). The script cuts from the PNGs. The colours were sampled from WebP number 1. |
| `Plana_Portrait_Expression_1.webp` | A copy of `expressions/` number 1.                                                                                                                                                                                                                                                                                                                           |
| `Plana_Halo.webp`                  | Her halo on its own, 160×120. The reference `HaloMark` is drawn from; not shipped.                                                                                                                                                                                                                                                                           |
| `Schale_Icon.webp`                 | Schale's emblem, 688×624. The reference `SchaleMark` is drawn from; not shipped.                                                                                                                                                                                                                                                                             |

What ships is the logo, the ten cut portraits, the backdrop and the three sign-in scene
frames in `src/assets/plana/`. The Discord
avatar is written to `branding/out/` for uploading by hand. The badge, the speech bubble,
the halo mark and the Schale mark are drawn in code.

Plana and this artwork are from Blue Archive. The wiki credits her design to DoReMi.
