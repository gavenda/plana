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
