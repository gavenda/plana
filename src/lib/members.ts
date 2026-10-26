/** What the Members endpoints return; see src/server/discord/members.ts. */

import type { ActivityMember, Track } from './activity'
import type { AuditEntry } from './audit'
import type { MemberVoice } from './voice'

export type MemberListItem = ActivityMember & {
  joinedAt: number | null
  birthday: { month: number; day: number } | null
}

export type MemberProfile = {
  member: ActivityMember
  /** False for someone who has left; their history still shows. */
  inServer: boolean
  joinedAt: number | null
  createdAt: number | null
  /** Highest first, without @everyone. */
  roles: { id: string; name: string; color: string }[]
  birthday: { month: number; day: number; daysUntil: number } | null
  /** Null for all time. */
  days: number | null
  voice: Omit<MemberVoice, 'member' | 'days'>
  games: {
    ms: number
    count: number
    top: {
      name: string
      iconUrl: string | null
      ms: number
      sessions: number
      playingSince: number | null
    }[]
  }
  music: {
    plays: number
    count: number
    top: { track: Track; plays: number; ms: number }[]
    listening: { track: Track; since: number } | null
  }
  audit: { entries: AuditEntry[]; total: number }
}
