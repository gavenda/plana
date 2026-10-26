import type { Guild, VoiceBasedChannel, VoiceState } from 'discord.js'

import type { OpenRow } from '../db/activity'
import {
  listChannelActiveTotals,
  listVoiceTotals,
  openVoiceSession,
  touchVoiceSessions,
} from '../db/voice'
import { notify } from '../live'
import { isConfiguredGuild } from '../utils/is-configured-guild'
import { describe, group, periodStart, sum, type ActivityMember } from './activity'
import { client, getGuild } from './client'
import { ok, primeMemberCache, type Result } from './service'

const TOP_ITEMS = 25
const TOP_MEMBERS = 5

type LiveVoice = OpenRow & { channelId: string }

/** Whose time is counting right now, with the session row recording it. */
const live = new Map<string, LiveVoice>()

/**
 * The channel a member's time counts in: any voice channel but the AFK one, while they can
 * hear. Idling in AFK or sitting deafened isn't time spent together, so neither counts.
 */
function countedChannel(state: VoiceState): VoiceBasedChannel | null {
  const channel = state.channel
  if (!channel || channel.id === state.guild.afkChannelId || state.deaf) return null
  return channel
}

/**
 * Brings the record in line with a member's voice state: a join opens a session, a leave
 * (or going AFK, or deafening) closes it, and a move closes one and opens another.
 */
export function trackVoice(state: VoiceState, now = Date.now()): void {
  if (!isConfiguredGuild(state.guild.id)) return
  if (state.member?.user.bot ?? client.users.cache.get(state.id)?.bot) return

  try {
    const channel = countedChannel(state)
    const current = live.get(state.id)
    if (current?.channelId === channel?.id) return

    // A closed session ends now rather than at its last checkpoint.
    if (current) {
      touchVoiceSessions([current.id], now)
      live.delete(state.id)
    }
    if (channel) {
      const row = openVoiceSession(state.id, channel.id, channel.name, now)
      live.set(state.id, { ...row, channelId: channel.id })
    }
    notify('voice')
  } catch (error) {
    console.error('[voice] could not record a voice change:', error)
  }
}

/**
 * Starts sessions for whoever is already in voice when the bot connects. Sessions left open
 * by the last run were closed at their last checkpoint, and one still going resumes.
 */
export async function startVoiceTracking(): Promise<void> {
  const guild = await getGuild()
  const now = Date.now()
  for (const state of guild.voiceStates.cache.values()) trackVoice(state, now)
  console.log(`[voice] tracking ${live.size} member(s) already in voice`)
}

/** Moves every open session's end up to now; see `touchVoiceSessions`. */
export function checkpointVoice(now = Date.now()): void {
  if (live.size === 0) return
  try {
    touchVoiceSessions(
      [...live.values()].map((row) => row.id),
      now,
    )
  } catch (error) {
    console.error('[voice] checkpoint failed:', error)
  }
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export type VoiceChannelRef = { id: string; name: string }

export type VoiceMemberStat = ActivityMember & {
  ms: number
  sessions: number
  /** Set for whoever is in voice right now. */
  inVoiceSince: number | null
}

export type VoiceChannelStat = VoiceChannelRef & {
  /** How long someone was in the channel; time with several people there counts once. */
  ms: number
  /** Everyone's time added up, so it exceeds `ms` when people overlap. */
  combinedMs: number
  members: number
  top: (ActivityMember & { ms: number })[]
}

export type VoiceOverview = {
  /** Null for all time. */
  days: number | null
  totals: { ms: number; members: number; sessions: number }
  members: VoiceMemberStat[]
  channels: VoiceChannelStat[]
  now: { member: ActivityMember; channel: VoiceChannelRef; since: number }[]
}

export type MemberVoice = {
  member: ActivityMember
  /** Null for all time. */
  days: number | null
  ms: number
  sessions: number
  /** Most hours first. */
  channels: (VoiceChannelRef & { ms: number; sessions: number })[]
  now: { channel: VoiceChannelRef; since: number } | null
}

/** The channel's current name, or the one recorded if it has since been deleted. */
function channelRef(guild: Guild, id: string, recorded: string): VoiceChannelRef {
  return { id, name: guild.channels.cache.get(id)?.name ?? recorded }
}

function liveChannel(guild: Guild, row: LiveVoice): VoiceChannelRef {
  return channelRef(guild, row.channelId, 'Unknown channel')
}

/** Who spent longest in voice, and where, over the last `days` (null: all time). */
export async function getVoiceOverview(days: number | null): Promise<Result<VoiceOverview>> {
  await primeMemberCache()
  const guild = await getGuild()
  const members = guild.members.cache
  const now = Date.now()

  // Open sessions count up to this moment, not to their last checkpoint.
  checkpointVoice(now)

  const since = periodStart(days, now)
  const rows = listVoiceTotals(since)
  const activeTotals = listChannelActiveTotals(since)

  const memberStats = [...group(rows, (row) => row.memberId)]
    .map(([memberId, memberRows]) => ({
      ...describe(members, memberId),
      ms: sum(memberRows.map((row) => row.ms)),
      sessions: sum(memberRows.map((row) => row.sessions)),
      inVoiceSince: live.get(memberId)?.startedAt ?? null,
    }))
    .sort((a, b) => b.ms - a.ms)

  const channelStats = [...group(rows, (row) => row.channelId)]
    .map(([channelId, channelRows]) => ({
      ...channelRef(guild, channelId, channelRows[0]!.channelName),
      ms: activeTotals.get(channelId) ?? 0,
      combinedMs: sum(channelRows.map((row) => row.ms)),
      members: channelRows.length,
      top: channelRows
        .sort((a, b) => b.ms - a.ms)
        .slice(0, TOP_MEMBERS)
        .map((row) => ({ ...describe(members, row.memberId), ms: row.ms })),
    }))
    .sort((a, b) => b.ms - a.ms)

  const inVoice = [...live]
    .map(([memberId, row]) => ({
      member: describe(members, memberId),
      channel: liveChannel(guild, row),
      since: row.startedAt,
    }))
    .sort((a, b) => a.since - b.since)

  return ok({
    days,
    totals: {
      ms: sum(memberStats.map((member) => member.ms)),
      members: memberStats.length,
      sessions: sum(memberStats.map((member) => member.sessions)),
    },
    members: memberStats.slice(0, TOP_ITEMS),
    channels: channelStats.slice(0, TOP_ITEMS),
    now: inVoice,
  })
}

/** One member's time in voice over the last `days` (null: all time), by channel. */
export async function getMemberVoice(
  memberId: string,
  days: number | null,
): Promise<Result<MemberVoice>> {
  await primeMemberCache()
  const guild = await getGuild()
  const now = Date.now()

  checkpointVoice(now)

  const channels = listVoiceTotals(periodStart(days, now))
    .filter((row) => row.memberId === memberId)
    .map((row) => ({
      ...channelRef(guild, row.channelId, row.channelName),
      ms: row.ms,
      sessions: row.sessions,
    }))
    .sort((a, b) => b.ms - a.ms)

  const current = live.get(memberId)

  return ok({
    member: describe(guild.members.cache, memberId),
    days,
    ms: sum(channels.map((channel) => channel.ms)),
    sessions: sum(channels.map((channel) => channel.sessions)),
    channels,
    now: current ? { channel: liveChannel(guild, current), since: current.startedAt } : null,
  })
}
