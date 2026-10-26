import { getGameIcon, saveGameIcon, type GameIcon } from '../db/game-icons'
import { logger } from '../logging'

const log = logger('activity')

/**
 * Game icons come from Discord itself when the presence names the game's application (the
 * icon Discord shows beside "Playing"), and otherwise from Steam by exact name. Neither
 * needs a key. Results are cached, misses included, so each game is looked up rarely.
 */

const DAY_MS = 86_400_000

/** A found icon is checked again after this long, in case the game changed it. */
const FOUND_TTL_MS = 30 * DAY_MS

/** A game no source knew is tried again after this long. */
const MISSING_TTL_MS = 7 * DAY_MS

/** After a network failure, a game waits this long before it is tried again. */
const FAILURE_BACKOFF_MS = 30 * 60_000

const REQUEST_TIMEOUT_MS = 10_000

const queued = new Set<string>()
const failedAt = new Map<string, number>()
let queue: Promise<void> = Promise.resolve()

async function getJson<T>(url: string): Promise<T | null> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: { 'User-Agent': 'Plana (Discord bot dashboard)' },
  })
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`${url} answered ${response.status}`)
  return (await response.json()) as T
}

async function fromDiscord(applicationId: string): Promise<string | null> {
  const app = await getJson<{ icon?: string | null }>(
    `https://discord.com/api/v10/applications/${applicationId}/rpc`,
  )
  return app?.icon
    ? `https://cdn.discordapp.com/app-icons/${applicationId}/${app.icon}.png?size=64`
    : null
}

/** Case, trademark signs and punctuation aside, so "DOOM Eternal™" matches "Doom Eternal". */
function normalise(name: string): string {
  return name
    .toLowerCase()
    .replace(/[™®©]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

async function fromSteam(game: string): Promise<string | null> {
  const search = await getJson<{ items?: { type: string; id: number; name: string }[] }>(
    `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(game)}&cc=us&l=en`,
  )
  // Only an exact name: the first result for a short name is often a different game.
  const wanted = normalise(game)
  const match = search?.items?.find(
    (item) => item.type === 'app' && normalise(item.name) === wanted,
  )
  if (!match) return null

  const apps = await getJson<{ response?: { apps?: { appid: number; icon?: string }[] } }>(
    `https://api.steampowered.com/ICommunityService/GetApps/v1/?appids%5B0%5D=${match.id}`,
  )
  const icon = apps?.response?.apps?.[0]?.icon
  return icon
    ? `https://cdn.cloudflare.steamstatic.com/steamcommunity/public/images/apps/${match.id}/${icon}.jpg`
    : null
}

async function resolve(game: string, applicationId: string | null): Promise<void> {
  try {
    let iconUrl: string | null = null
    let source: GameIcon['source'] = null

    if (applicationId) {
      iconUrl = await fromDiscord(applicationId)
      if (iconUrl) source = 'discord'
    }
    if (!iconUrl) {
      iconUrl = await fromSteam(game)
      if (iconUrl) source = 'steam'
    }

    saveGameIcon({ game, iconUrl, source, applicationId, checkedAt: Date.now() })
    failedAt.delete(game)
  } catch (error) {
    failedAt.set(game, Date.now())
    log.warning`could not look up an icon for ${game}: ${error}`
  }
}

function isStale(cached: GameIcon | null, applicationId: string | null, now: number): boolean {
  if (!cached) return true
  // Steam knew nothing, but Discord now names the game's application: worth asking it.
  if (applicationId && !cached.applicationId && cached.source !== 'discord') return true
  const ttl = cached.iconUrl ? FOUND_TTL_MS : MISSING_TTL_MS
  return now - cached.checkedAt > ttl
}

/**
 * Looks a game's icon up in the background if it isn't cached or is due a refresh.
 * Lookups run one at a time, to stay well inside Discord's and Steam's rate limits.
 */
export function requestGameIcon(game: string, applicationId: string | null = null): void {
  const now = Date.now()
  if (queued.has(game)) return
  if (now - (failedAt.get(game) ?? 0) < FAILURE_BACKOFF_MS) return

  const cached = getGameIcon(game)
  if (!isStale(cached, applicationId, now)) return

  queued.add(game)
  queue = queue
    .then(() => resolve(game, applicationId ?? cached?.applicationId ?? null))
    .finally(() => queued.delete(game))
}

/** The cached icon, or null; a missing or stale one is fetched for next time. */
export function gameIconUrl(game: string): string | null {
  requestGameIcon(game)
  return getGameIcon(game)?.iconUrl ?? null
}
