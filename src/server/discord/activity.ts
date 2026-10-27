import { ActivityType, type GuildMember, type Presence } from 'discord.js'

import { client, getGuild } from './client'
import {
  listGamePlayerTotals,
  listGameTotals,
  listTrackListenerTotals,
  listTrackTotals,
  openGameSession,
  openTrackPlay,
  touchActivity,
  type OpenRow,
  type Track,
} from '../db/activity'
import { gameIconUrl, requestGameIcon } from './game-icons'
import { listGameRoles } from '../db/game-nights'
import { env } from '../env'
import { isConfiguredGuild } from '../utils/is-configured-guild'
import { hasSubscribers, publish } from '../live'
import { ok, primeMemberCache, type Result } from './service'
import { logger } from '../logging'

const log = logger('activity')

/** How much play is lost at most if the process dies without warning. */
export const ACTIVITY_CHECKPOINT_INTERVAL_MS = 2 * 60_000

/** The longest period in days the dashboard asks for; beyond it, ask for all time. */
export const MAX_ACTIVITY_DAYS = 366

const DAY_MS = 86_400_000
const TOP_ITEMS = 25
const TOP_MEMBERS = 5

/** Presence is noisy; open pages get "Right now" at most this often. */
const PRESENCE_PUBLISH_MS = 1000

type LiveTrack = OpenRow & { track: Track }

/** What each member is doing right now, with the database row recording it. */
type Live = { games: Map<string, OpenRow>; track: LiveTrack | null }

const live = new Map<string, Live>()

/** Game names being played, each with the Discord application behind it when known. */
function playedGames(presence: Presence): Map<string, string | null> {
  const games = new Map<string, string | null>()
  for (const activity of presence.activities) {
    const name = activity.type === ActivityType.Playing ? activity.name.trim() : ''
    if (name && !games.get(name)) games.set(name, activity.applicationId)
  }
  return games
}

/** Spotify's presence: `details` is the title, `state` the artists split by "; ". */
function spotifyTrack(presence: Presence): Track | null {
  const activity = presence.activities.find(
    (candidate) =>
      candidate.type === ActivityType.Listening &&
      candidate.name === 'Spotify' &&
      candidate.syncId &&
      candidate.details,
  )
  if (!activity?.syncId || !activity.details) return null

  return {
    id: activity.syncId,
    title: activity.details,
    artist:
      activity.state
        ?.split(';')
        .map((name) => name.trim())
        .join(', ') || null,
    album: activity.assets?.largeText ?? null,
    artUrl: activity.assets?.largeImageURL() ?? null,
  }
}

/**
 * Brings the record in line with a member's presence: closes what they stopped, opens
 * what they started. Only changes touch the database, so frequent updates are cheap.
 */
export function trackPresence(presence: Presence, now = Date.now()): void {
  if (!presence.guild || !isConfiguredGuild(presence.guild.id)) return
  if (presence.user?.bot) return

  try {
    const memberId = presence.userId
    const games = playedGames(presence)
    const track = spotifyTrack(presence)
    const current: Live = live.get(memberId) ?? { games: new Map(), track: null }
    const ended: OpenRow[] = []
    let started = false

    for (const [game, row] of current.games) {
      if (games.has(game)) continue
      ended.push(row)
      current.games.delete(game)
    }
    for (const [game, applicationId] of games) {
      if (current.games.has(game)) continue
      current.games.set(game, openGameSession(memberId, game, now))
      started = true
      requestGameIcon(game, applicationId)
    }

    const endedTracks: OpenRow[] = []
    if (current.track && current.track.track.id !== track?.id) {
      endedTracks.push(current.track)
      current.track = null
    }
    if (track && !current.track) {
      current.track = { ...openTrackPlay(memberId, track, now), track }
      started = true
    }

    // A stopped row ends now rather than at its last checkpoint.
    touchActivity(
      { games: ended.map((row) => row.id), tracks: endedTracks.map((row) => row.id) },
      now,
    )

    if (current.games.size === 0 && !current.track) live.delete(memberId)
    else live.set(memberId, current)

    if (started || ended.length > 0 || endedTracks.length > 0) schedulePresencePublish()
  } catch (error) {
    log.error`could not record a presence: ${error}`
  }
}

let presenceTimer: ReturnType<typeof setTimeout> | undefined

/** Sends "Right now" to open pages, once for however many changes land within a second. */
function schedulePresencePublish(): void {
  presenceTimer ??= setTimeout(() => {
    presenceTimer = undefined
    const guild = client.guilds.cache.get(env.DISCORD_GUILD_ID)
    if (guild && hasSubscribers('presence')) publish('presence', listRightNow(guild.members.cache))
  }, PRESENCE_PUBLISH_MS)
}

/** What one member is playing and listening to right now, with when each began. */
export function memberActivityNow(memberId: string): {
  games: Map<string, number>
  track: { track: Track; since: number } | null
} {
  const entry = live.get(memberId)
  return {
    games: new Map([...(entry?.games ?? [])].map(([game, row]) => [game, row.startedAt])),
    track: entry?.track ? { track: entry.track.track, since: entry.track.startedAt } : null,
  }
}

/** Starts recording whoever is already playing or listening when the bot connects. */
export async function startActivityTracking(): Promise<void> {
  const guild = await getGuild()
  const now = Date.now()
  for (const presence of guild.presences.cache.values()) trackPresence(presence, now)
  log.info`tracking ${live.size} member(s) already playing or listening`
}

/** Moves every open row's end up to now; see `touchActivity`. */
export function checkpointActivity(now = Date.now()): void {
  const games: number[] = []
  const tracks: number[] = []
  for (const entry of live.values()) {
    for (const row of entry.games.values()) games.push(row.id)
    if (entry.track) tracks.push(entry.track.id)
  }
  if (games.length === 0 && tracks.length === 0) return

  try {
    touchActivity({ games, tracks }, now)
  } catch (error) {
    log.error`checkpoint failed: ${error}`
  }
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export type ActivityMember = {
  id: string
  username: string
  displayName: string
  /** Their name's colour in Discord (highest coloured role); #000000 for none. */
  color?: string
  avatarUrl: string
}

export type GameStat = {
  name: string
  iconUrl: string | null
  ms: number
  players: number
  top: (ActivityMember & { ms: number })[]
}

export type TrackStat = Track & {
  plays: number
  listeners: number
  ms: number
  top: (ActivityMember & { plays: number })[]
}

export type ActivityOverview = {
  /** Null for all time. */
  days: number | null
  totals: { gameMs: number; games: number; trackPlays: number; tracks: number }
  games: GameStat[]
  tracks: TrackStat[]
  playing: { member: ActivityMember; game: string; iconUrl: string | null; since: number }[]
  listening: { member: ActivityMember; track: Track; since: number }[]
}

function toMember(member: GuildMember): ActivityMember {
  return {
    id: member.id,
    username: member.user.tag,
    displayName: member.displayName,
    color: member.displayHexColor,
    avatarUrl: member.displayAvatarURL({ size: 64, extension: 'png' }),
  }
}

/** Someone who has since left still counts toward the totals, under whatever name is known. */
export function describe(members: Map<string, GuildMember>, id: string): ActivityMember {
  const member = members.get(id)
  if (member) return toMember(member)
  const user = client.users.cache.get(id)
  return {
    id,
    username: user?.tag ?? id,
    displayName: user?.displayName ?? 'Former member',
    avatarUrl:
      user?.displayAvatarURL({ size: 64, extension: 'png' }) ??
      'https://cdn.discordapp.com/embed/avatars/0.png',
  }
}

export function group<T, K>(items: T[], key: (item: T) => K): Map<K, T[]> {
  const groups = new Map<K, T[]>()
  for (const item of items) {
    const list = groups.get(key(item))
    if (list) list.push(item)
    else groups.set(key(item), [item])
  }
  return groups
}

/** The start of a period of `days`, or of all history when `days` is null. */
export const periodStart = (days: number | null, now: number) =>
  days == null ? 0 : now - days * DAY_MS

export const sum = (values: number[]) => values.reduce((total, value) => total + value, 0)

export type RightNow = Pick<ActivityOverview, 'playing' | 'listening'>

/** Who is playing and listening at this moment. */
function listRightNow(members: Map<string, GuildMember>): RightNow {
  const playing: RightNow['playing'] = []
  const listening: RightNow['listening'] = []
  for (const [memberId, entry] of live) {
    const member = describe(members, memberId)
    for (const [game, row] of entry.games) {
      playing.push({ member, game, iconUrl: gameIconUrl(game), since: row.startedAt })
    }
    if (entry.track) {
      listening.push({ member, track: entry.track.track, since: entry.track.startedAt })
    }
  }
  playing.sort((a, b) => a.since - b.since)
  listening.sort((a, b) => a.member.displayName.localeCompare(b.member.displayName))
  return { playing, listening }
}

/** Most-played games and Spotify tracks over the last `days` (null: all time), and what is on now. */
export async function getActivityOverview(days: number | null): Promise<Result<ActivityOverview>> {
  await primeMemberCache()
  const guild = await getGuild()
  const members = guild.members.cache
  const now = Date.now()
  const since = periodStart(days, now)

  // Open rows count up to this moment, not to their last checkpoint.
  checkpointActivity(now)

  const gameRows = listGameTotals(since)
  const games = [...group(gameRows, (row) => row.game)]
    .map(([name, rows]) => ({
      name,
      ms: sum(rows.map((row) => row.ms)),
      players: rows.length,
      top: rows
        .sort((a, b) => b.ms - a.ms)
        .slice(0, TOP_MEMBERS)
        .map((row) => ({ ...describe(members, row.memberId), ms: row.ms })),
    }))
    .sort((a, b) => b.ms - a.ms)

  const trackRows = listTrackTotals(since)
  const tracks = [...group(trackRows, (row) => row.id)]
    .map(([, rows]) => {
      const { id, title, artist, album, artUrl } = rows[0]!
      return {
        id,
        title,
        artist,
        album,
        artUrl,
        plays: sum(rows.map((row) => row.plays)),
        listeners: rows.length,
        ms: sum(rows.map((row) => row.ms)),
        top: rows
          .sort((a, b) => b.plays - a.plays || b.ms - a.ms)
          .slice(0, TOP_MEMBERS)
          .map((row) => ({ ...describe(members, row.memberId), plays: row.plays })),
      }
    })
    .sort((a, b) => b.plays - a.plays || b.listeners - a.listeners || b.ms - a.ms)

  const { playing, listening } = listRightNow(members)

  return ok({
    days,
    totals: {
      gameMs: sum(games.map((game) => game.ms)),
      games: games.length,
      trackPlays: sum(tracks.map((track) => track.plays)),
      tracks: tracks.length,
    },
    games: games.slice(0, TOP_ITEMS).map((game) => ({ ...game, iconUrl: gameIconUrl(game.name) })),
    tracks: tracks.slice(0, TOP_ITEMS),
    playing,
    listening,
  })
}

export type GamePlayers = {
  name: string
  iconUrl: string | null
  /** Null for all time. */
  days: number | null
  ms: number
  /** Most hours first; `playingSince` is set for whoever is playing it right now. */
  players: (ActivityMember & { ms: number; playingSince: number | null })[]
}

/** Everyone who played one game over the last `days` (null: all time), ranked by hours. */
export async function getGamePlayers(
  name: string,
  days: number | null,
): Promise<Result<GamePlayers>> {
  await primeMemberCache()
  const guild = await getGuild()
  const now = Date.now()

  checkpointActivity(now)

  const players = listGamePlayerTotals(name, periodStart(days, now)).map((row) => ({
    ...describe(guild.members.cache, row.memberId),
    ms: row.ms,
    playingSince: live.get(row.memberId)?.games.get(name)?.startedAt ?? null,
  }))

  return ok({
    name,
    iconUrl: gameIconUrl(name),
    days,
    ms: sum(players.map((player) => player.ms)),
    players,
  })
}

export type GameNightRole = {
  name: string
  iconUrl: string | null
  /** All-time hours and players, so the games people actually play come first. */
  ms: number
  players: number
  /** Pinged when a game night of this game starts; null for no ping. */
  roleId: string | null
}

/**
 * Every game ever played, and any game that still has a ping role though nobody has played it,
 * each with its role. Most played first.
 */
export function getGameNightRoles(): Result<GameNightRole[]> {
  checkpointActivity(Date.now())

  const roles = listGameRoles()
  const games: GameNightRole[] = [...group(listGameTotals(0), (row) => row.game)].map(
    ([name, rows]) => ({
      name,
      iconUrl: gameIconUrl(name),
      ms: sum(rows.map((row) => row.ms)),
      players: rows.length,
      roleId: roles.get(name) ?? null,
    }),
  )
  const played = new Set(games.map((game) => game.name))
  for (const [name, roleId] of roles) {
    if (!played.has(name))
      games.push({ name, iconUrl: gameIconUrl(name), ms: 0, players: 0, roleId })
  }
  return ok(games.sort((a, b) => b.ms - a.ms || a.name.localeCompare(b.name)))
}

export type TrackListeners = {
  id: string
  track: Track | null
  /** Null for all time. */
  days: number | null
  plays: number
  /** Most plays first; `listeningSince` is set for whoever has it on right now. */
  listeners: (ActivityMember & { plays: number; ms: number; listeningSince: number | null })[]
}

/** Everyone who played one track over the last `days` (null: all time), ranked by plays. */
export async function getTrackListeners(
  id: string,
  days: number | null,
): Promise<Result<TrackListeners>> {
  await primeMemberCache()
  const guild = await getGuild()
  const now = Date.now()

  checkpointActivity(now)

  const rows = listTrackListenerTotals(id, periodStart(days, now))
  const listeners = rows.map((row) => {
    const current = live.get(row.memberId)?.track
    return {
      ...describe(guild.members.cache, row.memberId),
      plays: row.plays,
      ms: row.ms,
      listeningSince: current?.track.id === id ? current.startedAt : null,
    }
  })

  return ok({
    id,
    track: rows[0]?.track ?? null,
    days,
    plays: sum(listeners.map((listener) => listener.plays)),
    listeners,
  })
}
