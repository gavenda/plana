/** What /api/game-nights returns; see GameNightEntry in src/server/discord/game-nights.ts. */

import type { ActivityMember } from './activity'

export type GameNightEntry = {
  messageId: string
  /** The post in Discord. */
  url: string
  game: string
  iconUrl: string | null
  status: 'planned' | 'live' | 'ended' | 'cancelled'
  /** When it started: the plan's time, or when Plana announced it. */
  startsAt: number
  postedAt: number
  endedAt: number | null
  planned: boolean
  host: ActivityMember | null
  voiceChannel: { id: string; name: string } | null
  joining: ActivityMember[]
  declined: ActivityMember[]
  /** Who was in voice for it; empty until it ends. */
  came: ActivityMember[]
  /** How many who said "I'm in" came, once it has ended. */
  showedUp: number | null
}

export type GameNightHistory = { entries: GameNightEntry[]; hasMore: boolean }
