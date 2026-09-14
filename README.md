# Plana

A Discord administration bot for a single small server, with a server-rendered
dashboard. The gateway client and the dashboard run in **one Bun process** and share
one SQLite database.

## What it does

**New member triage.** Discord assigns the **Triage** role itself, through onboarding or
a server auto-role. When someone joins, Plana posts an announcement card to the
configured channel carrying one button per assignable role, each labelled with the
role's own name (so renaming a role in Discord renames the button). An administrator
clicks a button, the member gets that role, the Triage role is removed, and the card
rewrites itself into a record of who decided what.

**Broadcast.** `/broadcast channel:#somewhere message:...` posts as the bot. Omit
`message:` and a multi-line composer opens instead, since a slash command option cannot
hold line breaks. The command is restricted to administrators.

**Dashboard.** Signed in with Discord OAuth2, administrators get an overview, the triage
queue (assign roles from the web, which also updates the Discord card), a broadcast
composer with a live preview, the role/channel settings editor, and an audit log of every
role assignment, broadcast and settings change.

## Requirements

- [Bun](https://bun.sh) 1.4 or newer
- **Node.js**, for builds only — `vue-tsc` patches the TypeScript compiler through Node's
  module internals and does not run correctly under Bun. Running the app needs only Bun.
- Redis, for caching. Optional but recommended — see [Caching](#caching).
- Podman or Docker, if you are deploying with containers

## Discord application setup

In the [Developer Portal](https://discord.com/developers/applications), create an
application, then:

1. **Bot** → copy the **token** into `DISCORD_TOKEN`.
2. **Bot** → enable the **Server Members Intent**. Without it `guildMemberAdd` never
   fires and the triage queue stays empty.
3. **OAuth2** → copy the **Client ID** and **Client Secret**.
4. **OAuth2 → Redirects** → add exactly `<PUBLIC_BASE_URL>/auth/callback`, for example
   `http://localhost:3000/auth/callback`.
5. Invite the bot, replacing the client ID:

   ```
   https://discord.com/oauth2/authorize?client_id=YOUR_CLIENT_ID&scope=bot%20applications.commands&permissions=268520448
   ```

   That permission set is Manage Roles, View Channels, Send Messages, Embed Links and
   Read Message History. Read Message History is what lets the bot re-fetch and rewrite
   its own announcement card. Add **Mention Everyone** only if broadcasts should be able
   to ping `@everyone`.

6. **Move the bot's own role above** Triage, Unit Owner and Boarders in
   _Server Settings → Roles_. Discord refuses to let a bot grant a role that sits at or
   above its own highest role; the dashboard flags roles it cannot manage.

Administrator permission in the guild is what grants dashboard access. It is re-checked
against Discord on every API request, so revoking it in Discord locks the person out
immediately rather than at session expiry.

## Configuration

Copy `.env.example` to `.env` and fill it in. `SESSION_SECRET` must be at least 32
characters — generate one with `openssl rand -base64 48`. Everything is validated at
startup and the process exits with a readable list if anything is missing.

The role and channel IDs are optional: they seed the database on first boot, and after
that the dashboard's settings page is the source of truth. Values already saved are
never overwritten by the environment.

## Development

```sh
bun install
bun run dev
```

The Bun server on `PORT` (3000 by default) is the front door and renders every page.
It starts Vite on port 5174 and proxies module, asset and HMR traffic to it, so
development and production take the same SSR path — there is no client-only dev mode to
diverge from.

```sh
bun run type-check   # vue-tsc for the app, tsc for the server
bun run lint
bun run format
```

## Production

```sh
bun run build   # type-check, then client and SSR bundles into dist/
bun run start
```

## Containers

Both stacks run the published image, `ghcr.io/gavenda/plana`, which
[the workflow](#publishing) builds on every push to `main`. Nothing needs to be built on
the deployment host. If you do want to build from a checkout, `Containerfile` and
`Dockerfile` semantics are the same here.

### Docker Compose

Two services: the bot and a Redis cache. Redis holds no persistent state, so it runs
with persistence off, a 64 MB cap and LRU eviction, and no volume. It is not published
on a port — only the bot reaches it, over the compose network.

```sh
cp .env.example .env   # then fill it in
docker compose pull
docker compose up -d
```

The compose file sets `REDIS_URL=redis://redis:6379` for the bot, overriding whatever
`.env` says, and waits for Redis to pass its healthcheck before starting the bot.

To build from this checkout instead of pulling, uncomment the `build` block in
`compose.yaml` and run `docker compose up -d --build`.

### Publishing

`.github/workflows/publish.yml` lint- and type-checks the project, then builds the
image and pushes it to GitHub Container Registry. Pull requests build the image to
prove it still assembles but publish nothing. It needs no secrets — the built-in
`GITHUB_TOKEN` authenticates to GHCR.

Images land at `ghcr.io/gavenda/plana`, tagged `latest` on the default branch, plus the
branch name, the full commit SHA, and — for a `v*` tag — `1.2.3` and `1.2`. Each push is
attested with build provenance.

The workflow builds `linux/amd64`. Add `linux/arm64` to `platforms` for a multi-arch
image; it is emulated on the runner, so expect a considerably longer build.

### Podman Quadlet (rootless systemd)

`plana.container` pulls `ghcr.io/gavenda/plana:latest`, so the units work as shipped:

```sh
install -Dm600 .env.example ~/.config/plana/plana.env   # then fill it in
mkdir -p ~/.config/containers/systemd
cp deploy/quadlet/*.container deploy/quadlet/*.volume deploy/quadlet/*.pod \
  ~/.config/containers/systemd/

systemctl --user daemon-reload
systemctl --user start plana.service

systemctl --user status plana.service
journalctl --user -u plana.service -f
```

Four units are generated: `plana-pod.service`, `plana-volume.service`,
`plana-redis.service` and `plana.service`. Starting `plana.service` pulls the others up
in order.

**Both containers run in one pod**, so they share a single network namespace: the bot
reaches the cache at `redis://127.0.0.1:6379`, Redis binds loopback and is never exposed
outside the pod, and port 3000 is published once, by the pod.

A pod is not just tidier here. A rootless pod with default networking uses `pasta` for
its namespace, so podman never asks **netavark** to build a bridge and apply firewall
rules. A named network does, and on hosts where that fails you get:

```
Error: netavark: nftables error: "nft" did not return successfully while applying ruleset
```

which usually means the kernel or `nft` binary is missing something netavark needs —
common on minimal VPS kernels, and on hosts where firewalld already owns the ruleset.
With a pod there is no ruleset to apply. If you hit that error on a *different* podman
workload, the usual host-side fix is to put this in
`~/.config/containers/containers.conf`:

```ini
[network]
firewall_driver = "iptables"
```

To run an image built from a local checkout, `podman build -t plana-local .`, then set
`Image=localhost/plana-local` in `plana.container` and drop `AutoUpdate=registry` —
there is no registry to check for a local build.

Check the units parse before installing them:

```sh
QUADLET_UNIT_DIRS=$PWD/deploy/quadlet \
  /usr/lib/systemd/system-generators/podman-system-generator --dryrun
```

To pick up newly published images automatically:

```sh
systemctl --user enable --now podman-auto-update.timer
```

`podman auto-update` pulls a newer `:latest`, restarts the unit, and rolls back to the
previous image if the new one fails its healthcheck.

To keep the bot running when you are not logged in:

```sh
loginctl enable-linger "$USER"
```

The container runs as an unprivileged user with a **read-only root filesystem**, all
capabilities dropped and `no-new-privileges`. SQLite lives on the `plana-data` volume at
`/data`, which is the only writable path besides `/tmp`.

The port is published on `127.0.0.1` only. Put a reverse proxy in front for TLS and set
`PUBLIC_BASE_URL` to the public `https://` origin — it must match the registered OAuth
redirect, and it also controls whether the session cookie is marked `Secure`.

Neither build path bakes the `HEALTHCHECK` into the image. BuildKit pushes an OCI image
and `podman build` produces one locally, and an OCI image config has no healthcheck
field, so it is dropped in both cases. This only matters if you run the container by
hand: both stacks declare the check themselves — `HealthCmd` in the quadlet unit and
`healthcheck` in the compose file. Use `podman build --format docker` to keep it in a
local build.

`GET /healthz` reports gateway connection state and whether settings are complete.

## Layout

```
src/
  server/
    env.ts            environment parsing and validation
    cache.ts          Redis read-through cache, degrades to live reads
    db/               bun:sqlite, migrations and repositories
    discord/
      service.ts      role assignment, broadcast, queue — shared by bot and API
      events.ts       gateway handlers (join, buttons, commands, modal)
      components.ts   the Components V2 announcement card
    http/
      auth.ts         Discord OAuth2 flow
      api.ts          dashboard JSON API
      ssr.ts          Vite in development, built bundles in production
      app.ts          route wiring
  app.ts              Vue app factory (shared by both entries)
  entry-client.ts     hydration
  entry-server.ts     renderToString
  assets/main.css     Tailwind theme tokens and component layer
  views/ components/ stores/ lib/
deploy/quadlet/       Podman systemd units
.github/workflows/    lint, type-check, build and publish to GHCR
```

The bot and the dashboard call the same functions in `discord/service.ts`, so a role
assigned from the web and one assigned from a button take an identical path: the same
permission and hierarchy checks, the same audit entry, and the same update to the
original announcement message.

## Caching

Past the gateway's large-guild threshold, Discord does not send the full member list in
`GUILD_CREATE`; it has to be requested over the gateway with **opcode 8, Request Guild
Members**. That request is rate limited, and sending one per dashboard load will get the
bot throttled or disconnected.

So the member list is requested **once at startup**, and `GUILD_MEMBER_ADD` / `UPDATE` /
`REMOVE` keep discord.js's cache accurate from then on. A refresh runs every 30 minutes
as a safety net against a missed event. Nothing on the request path talks to the gateway.

Redis caches the derived payloads on top of that — the triage queue (60s) and the
role/channel directory (300s) — so repeated dashboard loads do not rebuild them, and the
cache survives a restart. Entries are dropped immediately on the events that invalidate
them (a member joining or leaving, a role change, a channel change, a role assignment, a
settings update) rather than waiting for the TTL.

**Redis is a cache, never a source of truth.** If it is unreachable the bot logs one
warning and serves everything live; it does not fail requests and does not crash. Set
`REDIS_URL=` (empty) to run without it entirely. `GET /healthz` reports
`cache: connected | unavailable | disabled`.

## Styling

Tailwind CSS v4, configured entirely in `src/assets/main.css` — there is no
`tailwind.config.js`. The `@theme` block defines the palette, and every token there
generates utilities, so `--color-surface` gives `bg-surface`, `text-surface` and
`border-surface`. Translucent tints use the opacity modifier (`bg-accent/15`) rather
than separate tokens.

Layout, spacing and typography are utilities in the markup; no component has a
`<style>` block. A small `@layer components` block holds only the primitives that carry
variants and repeat across many views — `.btn`, form controls, `.badge` and `.alert`.

`bun run format` sorts class lists via `prettier-plugin-tailwindcss`, pinned to the
`0.6` line because 0.7 and 0.8 crash on every file with Prettier 3.6.

## Data

One SQLite file, created and migrated on startup. It holds the role/channel settings,
dashboard sessions, the audit log, and a record of which message announced which member
so that a dashboard assignment can update the right Discord card. OAuth access tokens are
**not** stored — the token is used once at login to read the user's ID, and membership and
permissions are read through the bot from then on.
