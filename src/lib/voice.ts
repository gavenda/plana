/** What the Voice endpoints return; see src/server/discord/voice.ts. */

import type { ActivityMember } from './activity'

export type VoiceChannelRef = { id: string; name: string }

export type VoiceOverview = {
  /** Null for all time. */
  days: number | null
  totals: { ms: number; members: number; sessions: number }
  members: (ActivityMember & { ms: number; sessions: number; inVoiceSince: number | null })[]
  channels: (VoiceChannelRef & {
    /** How long someone was in the channel; time with several people there counts once. */
    ms: number
    /** Everyone's time added up, so it exceeds `ms` when people overlap. */
    combinedMs: number
    members: number
    top: (ActivityMember & { ms: number })[]
  })[]
  now: { member: ActivityMember; channel: VoiceChannelRef; since: number }[]
}

export type MemberVoice = {
  member: ActivityMember
  /** Null for all time. */
  days: number | null
  ms: number
  sessions: number
  channels: (VoiceChannelRef & { ms: number; sessions: number })[]
  now: { channel: VoiceChannelRef; since: number } | null
}
