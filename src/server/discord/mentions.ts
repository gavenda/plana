import { listMemberGameTotals, listMemberTrackTotals } from '../db/activity'
import { listChannelActiveTotals, listVoiceTotals } from '../db/voice'
import { checkpointActivity, describe, periodStart, sum, type ActivityMember } from './activity'
import { getGuild } from './client'
import { err, ok, primeMemberCache, type Result } from './service'
import { checkpointVoice } from './voice'

/** The period every mention's numbers cover. */
export const MENTION_DAYS = 30

const TOP_MEMBERS = 3

export type MentionKind = 'user' | 'role' | 'channel'

/** A few numbers about a user, role or channel, for the tooltip on its mention. */
export type MentionBrief =
  | {
      kind: 'user'
      member: ActivityMember
      /** False for someone who has left. */
      inServer: boolean
      joinedAt: number | null
      days: number
      voiceMs: number
      gameMs: number
      topGame: string | null
      plays: number
    }
  | { kind: 'role'; name: string; color: string; members: number }
  | {
      kind: 'channel'
      name: string
      category: string | null
      /** Null for a channel that isn't a voice channel, which tracks nothing. */
      voice: {
        days: number
        ms: number
        members: number
        top: { displayName: string; ms: number }[]
      } | null
    }

/** The brief for one mention, with numbers over the last MENTION_DAYS days. */
export async function getMentionBrief(
  kind: MentionKind,
  id: string,
): Promise<Result<MentionBrief>> {
  await primeMemberCache()
  const guild = await getGuild()
  const now = Date.now()
  const since = periodStart(MENTION_DAYS, now)

  if (kind === 'role') {
    const role = guild.roles.cache.get(id)
    if (!role) return err('unknown_role', 'error.unknown_role')
    return ok({ kind, name: role.name, color: role.hexColor, members: role.members.size })
  }

  if (kind === 'channel') {
    const channel = guild.channels.cache.get(id)
    if (!channel) return err('unknown_channel', 'error.unknown_channel')

    const category = channel.parent?.name ?? null
    if (!channel.isVoiceBased()) return ok({ kind, name: channel.name, category, voice: null })

    // Open sessions count up to this moment, not to their last checkpoint.
    checkpointVoice(now)
    const rows = listVoiceTotals(since)
      .filter((row) => row.channelId === id)
      .sort((a, b) => b.ms - a.ms)
    return ok({
      kind,
      name: channel.name,
      category,
      voice: {
        days: MENTION_DAYS,
        ms: listChannelActiveTotals(since).get(id) ?? 0,
        members: rows.length,
        top: rows.slice(0, TOP_MEMBERS).map((row) => ({
          displayName: describe(guild.members.cache, row.memberId).displayName,
          ms: row.ms,
        })),
      },
    })
  }

  const member = guild.members.cache.get(id)
  checkpointActivity(now)
  checkpointVoice(now)

  const games = listMemberGameTotals(id, since)
  const tracks = listMemberTrackTotals(id, since)
  return ok({
    kind,
    member: describe(guild.members.cache, id),
    inServer: member != null,
    joinedAt: member?.joinedTimestamp ?? null,
    days: MENTION_DAYS,
    voiceMs: sum(
      listVoiceTotals(since)
        .filter((row) => row.memberId === id)
        .map((row) => row.ms),
    ),
    gameMs: sum(games.map((row) => row.ms)),
    topGame: games[0]?.game ?? null,
    plays: sum(tracks.map((row) => row.plays)),
  })
}
