import { listMemberAudit, type AuditEntry } from '../db/audit'
import { listMemberGameTotals, listMemberTrackTotals, type Track } from '../db/activity'
import { getBirthday, listBirthdays } from '../db/birthdays'
import {
  checkpointActivity,
  describe,
  memberActivityNow,
  periodStart,
  sum,
  type ActivityMember,
} from './activity'
import { daysUntil, today } from './birthdays'
import { getGuild } from './client'
import { gameIconUrl } from './game-icons'
import { ok, primeMemberCache, type Result } from './service'
import { getMemberVoice, type MemberVoice } from './voice'

/** How many of each list a member's page shows. */
const TOP_ITEMS = 10
const AUDIT_ITEMS = 25

export type MemberListItem = ActivityMember & {
  joinedAt: number | null
  birthday: { month: number; day: number } | null
}

/** Everyone in the server but bots, by name. */
export async function listMembers(): Promise<Result<MemberListItem[]>> {
  await primeMemberCache()
  const guild = await getGuild()
  const birthdays = new Map(listBirthdays().map((birthday) => [birthday.memberId, birthday]))

  const members = [...guild.members.cache.values()]
    .filter((member) => !member.user.bot)
    .map((member) => {
      const birthday = birthdays.get(member.id)
      return {
        ...describe(guild.members.cache, member.id),
        joinedAt: member.joinedTimestamp,
        birthday: birthday ? { month: birthday.month, day: birthday.day } : null,
      }
    })
    .sort((a, b) => a.displayName.localeCompare(b.displayName))

  return ok(members)
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
    /** Most hours first; `playingSince` is set for whatever they are playing now. */
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
    /** Most plays first. */
    top: { track: Track; plays: number; ms: number }[]
    listening: { track: Track; since: number } | null
  }
  audit: { entries: AuditEntry[]; total: number }
}

/** Everything recorded about one member, with activity over the last `days` (null: all time). */
export async function getMemberProfile(
  memberId: string,
  days: number | null,
): Promise<Result<MemberProfile>> {
  await primeMemberCache()
  const guild = await getGuild()
  const member = guild.members.cache.get(memberId)
  const now = Date.now()
  const since = periodStart(days, now)

  // Open rows count up to this moment, not to their last checkpoint.
  checkpointActivity(now)

  const voice = await getMemberVoice(memberId, days)
  if (!voice.ok) return voice
  const { ms, sessions, channels, now: inVoice } = voice.data

  const activityNow = memberActivityNow(memberId)
  const gameRows = listMemberGameTotals(memberId, since)
  const trackRows = listMemberTrackTotals(memberId, since)

  const birthday = getBirthday(memberId)

  return ok({
    member: describe(guild.members.cache, memberId),
    inServer: member != null,
    joinedAt: member?.joinedTimestamp ?? null,
    createdAt: member?.user.createdTimestamp ?? null,
    roles: member
      ? [...member.roles.cache.values()]
          .filter((role) => role.id !== guild.id)
          .sort((a, b) => b.position - a.position)
          .map((role) => ({ id: role.id, name: role.name, color: role.hexColor }))
      : [],
    birthday: birthday
      ? { month: birthday.month, day: birthday.day, daysUntil: daysUntil(birthday, today()) }
      : null,
    days,
    voice: { ms, sessions, channels: channels.slice(0, TOP_ITEMS), now: inVoice },
    games: {
      ms: sum(gameRows.map((row) => row.ms)),
      count: gameRows.length,
      top: gameRows.slice(0, TOP_ITEMS).map((row) => ({
        name: row.game,
        iconUrl: gameIconUrl(row.game),
        ms: row.ms,
        sessions: row.sessions,
        playingSince: activityNow.games.get(row.game) ?? null,
      })),
    },
    music: {
      plays: sum(trackRows.map((row) => row.plays)),
      count: trackRows.length,
      top: trackRows.slice(0, TOP_ITEMS),
      listening: activityNow.track,
    },
    audit: listMemberAudit(memberId, AUDIT_ITEMS),
  })
}
