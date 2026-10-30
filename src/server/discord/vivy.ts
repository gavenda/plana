import { RedisClient } from 'bun'

import { env } from '../env'
import { logger } from '../logging'
import { shiftDate, makeSlotter } from '../utils/zoned-hours'
import { describe, sum, type ActivityMember } from './activity'
import { getGuild } from './client'
import { t } from '../i18n'
import { primeMemberCache } from './service'

/**
 * What Vivy, the server's music bot, has played, read from the Redis both bots share
 * (REDIS_URL, with VIVY_STATS on). Read only: nothing here writes to Vivy's data. Vivy keeps all-time counts per server, and since
 * v2.3 counts per day too, keyed by the date in its STATS_TIMEZONE, which should match
 * BIRTHDAY_TIMEZONE here. See `src/stats/track.ts` in Vivy for the keys.
 */

const log = logger('vivy')

const TOP_ITEMS = 25

export type VivyTrack = {
  id: string
  title: string
  artist: string | null
  /** Where it plays from, such as its YouTube page. */
  url: string | null
  artUrl: string | null
  plays: number
  /** Plays times the track's length. */
  ms: number
}

export type VivyMusic = {
  /** Null for all time. */
  days: number | null
  timeZone: string
  /** The first local date Vivy counted by day; periods can't reach further back. Null if none yet. */
  dailySince: string | null
  totals: { plays: number; tracks: number; requesters: number; ms: number }
  tracks: VivyTrack[]
  requesters: (ActivityMember & { requests: number })[]
}

/**
 * Its own connection to the shared Redis rather than the cache's: the cache hides failures
 * and serves live values, while a failure here should show on the page.
 */
let client: RedisClient | null = null

export const isVivyEnabled = () => env.VIVY_STATS && Boolean(env.REDIS_URL)

function getClient(): RedisClient | null {
  if (!isVivyEnabled()) return null
  client ??= new RedisClient(env.REDIS_URL, {
    // A dead connection should fail the request quickly, not hang it.
    enableOfflineQueue: false,
    autoReconnect: true,
    connectionTimeout: 2000,
  })
  return client
}

/** Best-effort connect at startup, so a wrong URL or password shows in the log straight away. */
export async function connectVivy(): Promise<void> {
  const redis = getClient()
  if (!redis) return
  try {
    await redis.connect()
    log.info`reading Vivy's stats from Redis`
  } catch (error) {
    log.warning`Vivy's stats unavailable: ${error instanceof Error ? error.message : error}`
  }
}

export function closeVivy(): void {
  client?.close()
  client = null
}

type Scores = Map<string, number>

/** A sorted set's members and scores; RESP3 answers ZRANGE WITHSCORES as [member, score] pairs. */
async function readScores(redis: RedisClient, key: string): Promise<Scores> {
  const reply = (await redis.send('ZRANGE', [key, '0', '-1', 'WITHSCORES'])) as unknown
  const scores: Scores = new Map()
  if (!Array.isArray(reply)) return scores
  for (const pair of reply) {
    if (Array.isArray(pair)) scores.set(String(pair[0]), Number(pair[1]))
  }
  return scores
}

function addInto(total: Scores, part: Scores): void {
  for (const [member, score] of part) total.set(member, (total.get(member) ?? 0) + score)
}

async function readHash(redis: RedisClient, key: string): Promise<Record<string, string>> {
  const reply = (await redis.send('HGETALL', [key])) as unknown
  return reply && typeof reply === 'object' && !Array.isArray(reply)
    ? (reply as Record<string, string>)
    : {}
}

/** Several members' scores at once, null for members not in the set. */
async function readScoresOf(
  redis: RedisClient,
  key: string,
  members: string[],
): Promise<(number | null)[]> {
  if (members.length === 0) return []
  const reply = (await redis.send('ZMSCORE', [key, ...members])) as unknown
  if (!Array.isArray(reply)) return members.map(() => null)
  return reply.map((score) => (score == null ? null : Number(score)))
}

/** A YouTube video's thumbnail, for tracks Vivy saw before it kept artwork. */
function youtubeArt(id: string, url: string | null): string | null {
  if (!url || !/youtu\.?be/.test(url) || !/^[\w-]{11}$/.test(id)) return null
  return `https://i.ytimg.com/vi/${id}/mqdefault.jpg`
}

/**
 * Most-played tracks and top requesters over the last `days` (null: all time). Null when
 * VIVY_STATS is off; throws when Redis can't be reached.
 */
export async function getVivyMusic(
  days: number | null,
  now = Date.now(),
): Promise<VivyMusic | null> {
  const redis = getClient()
  if (!redis) return null
  // With no offline queue, a command sent before the connection is up fails outright.
  if (!redis.connected) await redis.connect()

  const guildKey = `stats:guild:${env.DISCORD_GUILD_ID}`
  const timeZone = env.BIRTHDAY_TIMEZONE
  const dailySince = (await redis.get(`${guildKey}:day:first`)) ?? null

  const plays: Scores = new Map()
  const requests: Scores = new Map()

  if (days == null) {
    const [allPlays, allRequests] = await Promise.all([
      readScores(redis, `${guildKey}:tracks:plays`),
      readScores(redis, `${guildKey}:users:requests`),
    ])
    addInto(plays, allPlays)
    addInto(requests, allRequests)
  } else if (dailySince) {
    // Today and the days before it, skipping any before Vivy started counting by day.
    const today = makeSlotter(timeZone)(now).date
    const dates = Array.from({ length: days }, (_, index) => shiftDate(today, -index)).filter(
      (date) => date >= dailySince,
    )
    // Sent together, so the client pipelines them into one round trip.
    const parts = await Promise.all(
      dates.flatMap((date) => [
        readScores(redis, `${guildKey}:day:${date}:tracks:plays`),
        readScores(redis, `${guildKey}:day:${date}:users:requests`),
      ]),
    )
    parts.forEach((part, index) => addInto(index % 2 === 0 ? plays : requests, part))
  }

  // A track's length is the same every time it plays, so Vivy's all-servers totals give it
  // even for tracks seen before it started keeping the length.
  const ids = [...plays.keys()]
  const [durations, globalPlays] = await Promise.all([
    readScoresOf(redis, 'stats:tracks:duration', ids),
    readScoresOf(redis, 'stats:tracks:plays', ids),
  ])
  const lengthOf = new Map(
    ids.map((id, index) => {
      const count = globalPlays[index] ?? 0
      return [id, count > 0 ? (durations[index] ?? 0) / count : 0]
    }),
  )

  const ranked = ids
    .map((id) => ({
      id,
      plays: plays.get(id)!,
      ms: Math.round(plays.get(id)! * lengthOf.get(id)!),
    }))
    .sort((a, b) => b.plays - a.plays || b.ms - a.ms)

  const top = ranked.slice(0, TOP_ITEMS)
  const metas = await Promise.all(
    top.map((track) => readHash(redis, `stats:track:meta:${encodeURIComponent(track.id)}`)),
  )
  const tracks = top.map((track, index): VivyTrack => {
    const meta = metas[index]!
    const url = meta.uri || null
    return {
      ...track,
      title: meta.title || track.id,
      artist: meta.author || null,
      url,
      artUrl: meta.artworkUrl || youtubeArt(track.id, url),
    }
  })

  await primeMemberCache()
  const members = (await getGuild()).members.cache
  const topRequesters = [...requests].sort((a, b) => b[1] - a[1]).slice(0, TOP_ITEMS)
  // Someone no longer in the server keeps the name Vivy last saw them under.
  const userMetas = await Promise.all(
    topRequesters.map(([id]) =>
      members.has(id) ? Promise.resolve(null) : readHash(redis, `stats:user:meta:${id}`),
    ),
  )
  const requesters = topRequesters.map(([id, count], index) => {
    const member = describe(members, id)
    const username = userMetas[index]?.username
    return {
      ...member,
      ...(username && member.displayName === t('fallback.former_member')
        ? { displayName: username }
        : {}),
      requests: count,
    }
  })

  return {
    days,
    timeZone,
    dailySince,
    totals: {
      plays: sum(ranked.map((track) => track.plays)),
      tracks: ranked.length,
      requesters: requests.size,
      ms: sum(ranked.map((track) => track.ms)),
    },
    tracks,
    requesters,
  }
}
