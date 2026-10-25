import { ActivityType, type GuildMember, type Presence } from 'discord.js'

import { client, getGuild } from './client'
import {
  listGamePlayerTotals,
  listGameTotals,
  listTrackTotals,
  openGameSession,
  openTrackPlay,
  touchActivity,
  type OpenRow,
  type Track,
} from '../db/activity'
import { gameIconUrl, requestGameIcon } from './game-icons'
import { isConfiguredGuild } from '../utils/is-configured-guild'
import { ok, primeMemberCache, type Result } from './service'

/** How much play is lost at most if the process dies without warning. */
export const ACTIVITY_CHECKPOINT_INTERVAL_MS = 2 * 60_000

/** How long play history is kept; also the longest period the dashboard offers. */
export const ACTIVITY_RETENTION_DAYS = 90

const DAY_MS = 86_400_000
const TOP_ITEMS = 25
const TOP_MEMBERS = 5

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

    for (const [game, row] of current.games) {
      if (games.has(game)) continue
      ended.push(row)
      current.games.delete(game)
    }
    for (const [game, applicationId] of games) {
      if (current.games.has(game)) continue
      current.games.set(game, openGameSession(memberId, game, now))
      requestGameIcon(game, applicationId)
    }

    const endedTracks: OpenRow[] = []
    if (current.track && current.track.track.id !== track?.id) {
      endedTracks.push(current.track)
      current.track = null
    }
    if (track && !current.track) {
      current.track = { ...openTrackPlay(memberId, track, now), track }
    }

    // A stopped row ends now rather than at its last checkpoint.
    touchActivity(
      { games: ended.map((row) => row.id), tracks: endedTracks.map((row) => row.id) },
      now,
    )

    if (current.games.size === 0 && !current.track) live.delete(memberId)
    else live.set(memberId, current)
  } catch (error) {
    console.error('[activity] could not record a presence:', error)
  }
}

/** Starts recording whoever is already playing or listening when the bot connects. */
export async function startActivityTracking(): Promise<void> {
  const guild = await getGuild()
  const now = Date.now()
  for (const presence of guild.presences.cache.values()) trackPresence(presence, now)
  console.log(`[activity] tracking ${live.size} member(s) already playing or listening`)
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
    console.error('[activity] checkpoint failed:', error)
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
  days: number
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
function describe(members: Map<string, GuildMember>, id: string): ActivityMember {
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

function group<T, K>(items: T[], key: (item: T) => K): Map<K, T[]> {
  const groups = new Map<K, T[]>()
  for (const item of items) {
    const list = groups.get(key(item))
    if (list) list.push(item)
    else groups.set(key(item), [item])
  }
  return groups
}

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0)

/** Most-played games and Spotify tracks over the last `days`, and what is on right now. */
export async function getActivityOverview(days: number): Promise<Result<ActivityOverview>> {
  await primeMemberCache()
  const guild = await getGuild()
  const members = guild.members.cache
  const now = Date.now()
  const since = now - days * DAY_MS

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

  const playing: ActivityOverview['playing'] = []
  const listening: ActivityOverview['listening'] = []
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
  days: number
  ms: number
  /** Most hours first; `playingSince` is set for whoever is playing it right now. */
  players: (ActivityMember & { ms: number; playingSince: number | null })[]
}

/** Everyone who played one game over the last `days`, ranked by hours. */
export async function getGamePlayers(name: string, days: number): Promise<Result<GamePlayers>> {
  await primeMemberCache()
  const guild = await getGuild()
  const now = Date.now()

  checkpointActivity(now)

  const players = listGamePlayerTotals(name, now - days * DAY_MS).map((row) => ({
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
