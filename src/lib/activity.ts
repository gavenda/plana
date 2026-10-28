/** What the Games & music endpoints return; see src/server/discord/activity.ts. */

export type ActivityMember = {
  id: string
  username: string
  displayName: string
  /** Their name's colour in Discord (highest coloured role); #000000 for none. */
  color?: string
  avatarUrl: string
}

export type Track = {
  id: string
  title: string
  artist: string | null
  album: string | null
  artUrl: string | null
}

export type ActivityOverview = {
  /** Null for all time. */
  days: number | null
  totals: { gameMs: number; games: number; trackPlays: number; tracks: number }
  games: {
    name: string
    iconUrl: string | null
    ms: number
    players: number
    top: (ActivityMember & { ms: number })[]
  }[]
  tracks: (Track & {
    plays: number
    listeners: number
    ms: number
    top: (ActivityMember & { plays: number })[]
  })[]
  playing: { member: ActivityMember; game: string; iconUrl: string | null; since: number }[]
  listening: { member: ActivityMember; track: Track; since: number }[]
}

export type GamePlayers = {
  name: string
  iconUrl: string | null
  /** Null for all time. */
  days: number | null
  ms: number
  players: (ActivityMember & { ms: number; playingSince: number | null })[]
}

/** A game and the role its game nights ping; see `getGameNightRoles`. */
export type GameNightRole = {
  name: string
  iconUrl: string | null
  /** All time. */
  ms: number
  players: number
  /** Null for no ping. */
  roleId: string | null
}

export type TrackListeners = {
  id: string
  /** Null when nobody played it in the period. */
  track: Track | null
  /** Null for all time. */
  days: number | null
  plays: number
  listeners: (ActivityMember & { plays: number; ms: number; listeningSince: number | null })[]
}

/** Who is playing and listening at this moment; also what the `presence` live topic sends. */
export type RightNow = Pick<ActivityOverview, 'playing' | 'listening'>

export type TrendMetric = 'voice' | 'games' | 'music'

/** What `/api/activity/daily` returns; see src/server/discord/trends.ts. */
export type DailyTrends = {
  timeZone: string
  /** Local dates as YYYY-MM-DD, oldest first; the last is today. */
  dates: string[]
  trends: Record<
    TrendMetric,
    {
      /** Milliseconds per day, oldest first; the last is today so far. */
      daily: number[]
      /** The last 7 days. */
      week: number
      /** The 7 days before those. */
      previousWeek: number
    }
  >
}

/** What `/api/activity/heatmap` returns; see src/server/discord/heatmaps.ts. */
export type Heatmap = {
  kind: 'voice' | 'music'
  /** Null for all time. */
  days: number | null
  timeZone: string
  /** Average members doing it, by weekday (Monday first) then hour of the day. */
  grid: number[][]
}

/** What `/api/members/:id/activity` returns; see src/server/discord/trends.ts. */
export type MemberActivity = {
  timeZone: string
  /** Oldest first, starting on a Monday; the last is today so far. */
  days: { date: string; voiceMs: number; gameMs: number; activeMs: number }[]
}
