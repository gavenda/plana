import { PermissionFlagsBits, type GuildMember } from 'discord.js'

import { getGuild, isReady } from './client'
import { recordAudit } from '../db/audit'
import {
  getBirthday,
  isLeapYear,
  isValidBirthday,
  listBirthdays,
  listDueBirthdays,
  markBirthdayAnnounced,
  removeBirthday,
  setBirthday,
  type Birthday,
} from '../db/birthdays'
import { getSettings } from '../db/settings'
import { env } from '../env'
import { DEFAULT_LOCALE, t } from '../i18n'
import { err, ok, primeMemberCache, type ActionSource, type Actor, type Result } from './service'

export type CalendarDate = { year: number; month: number; day: number }

/** Today's date in the configured time zone, not the host's. */
export function today(timeZone: string = env.BIRTHDAY_TIMEZONE, now = new Date()): CalendarDate {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(now)

  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((entry) => entry.type === type)?.value)

  return { year: part('year'), month: part('month'), day: part('day') }
}

/** "March 14", in the given locale. Year-free, since only month and day are stored. */
export function formatBirthday(birthday: Pick<Birthday, 'month' | 'day'>, locale: string): string {
  // Year 2000 is a leap year, so 29 February formats correctly. UTC keeps the day stable.
  const date = new Date(Date.UTC(2000, birthday.month - 1, birthday.day))
  return new Intl.DateTimeFormat(locale, { month: 'long', day: 'numeric', timeZone: 'UTC' }).format(
    date,
  )
}

/** Whole days from `from` until the next occurrence of a birthday; 0 means today. */
export function daysUntil(birthday: Pick<Birthday, 'month' | 'day'>, from: CalendarDate): number {
  const start = Date.UTC(from.year, from.month - 1, from.day)

  for (const year of [from.year, from.year + 1]) {
    // Leap-day birthdays are observed on 28 February in common years.
    const day = birthday.month === 2 && birthday.day === 29 && !isLeapYear(year) ? 28 : birthday.day
    const next = Date.UTC(year, birthday.month - 1, day)
    if (next >= start) return Math.round((next - start) / 86_400_000)
  }
  return 0
}

/** Stored birthdays of members still in the server, soonest first. */
export async function listUpcomingBirthdays(
  limit: number,
): Promise<{ member: GuildMember; birthday: Birthday; days: number }[]> {
  const guild = await getGuild()
  const from = today()

  return listBirthdays()
    .map((birthday) => ({
      birthday,
      member: guild.members.cache.get(birthday.memberId),
      days: daysUntil(birthday, from),
    }))
    .filter((entry): entry is typeof entry & { member: GuildMember } => entry.member != null)
    .sort((a, b) => a.days - b.days)
    .slice(0, limit)
}

// ---------------------------------------------------------------------------
// Editing, shared by /birthday and the dashboard
// ---------------------------------------------------------------------------

async function findMember(memberId: string): Promise<GuildMember | null> {
  const guild = await getGuild()
  return (
    guild.members.cache.get(memberId) ?? (await guild.members.fetch(memberId).catch(() => null))
  )
}

function label(birthday: Pick<Birthday, 'month' | 'day'>): string {
  return formatBirthday(birthday, DEFAULT_LOCALE)
}

export async function saveBirthday(input: {
  memberId: string
  month: number
  day: number
  actor: Actor
  source: ActionSource
}): Promise<Result<{ month: number; day: number }>> {
  const { memberId, month, day, actor, source } = input

  if (!isValidBirthday(month, day)) return err('invalid_birthday', 'error.invalid_birthday')

  const member = await findMember(memberId)
  if (!member) return err('unknown_member', 'error.unknown_member')

  const before = getBirthday(memberId)
  setBirthday(memberId, month, day)

  if (before?.month !== month || before?.day !== day) {
    recordAudit({
      action: 'birthday.set',
      source,
      actorId: actor.id,
      actorName: actor.name,
      targetId: member.id,
      targetName: member.displayName,
      detail: { from: before ? label(before) : null, to: label({ month, day }) },
    })
  }

  return ok({ month, day })
}

export async function deleteBirthday(input: {
  memberId: string
  actor: Actor
  source: ActionSource
}): Promise<Result<{ removed: boolean }>> {
  const { memberId, actor, source } = input

  const before = getBirthday(memberId)
  if (!before) return ok({ removed: false })

  removeBirthday(memberId)

  const member = await findMember(memberId)
  recordAudit({
    action: 'birthday.remove',
    source,
    actorId: actor.id,
    actorName: actor.name,
    targetId: memberId,
    targetName: member?.displayName ?? null,
    detail: { from: label(before) },
  })

  return ok({ removed: true })
}

export type BirthdayMember = {
  id: string
  username: string
  displayName: string
  /** The colour Discord draws their name in (their highest coloured role); #000000 for none. */
  color: string
  avatarUrl: string
}

function toBirthdayMember(member: GuildMember): BirthdayMember {
  return {
    id: member.id,
    username: member.user.tag,
    displayName: member.displayName,
    color: member.displayHexColor,
    avatarUrl: member.displayAvatarURL({ size: 64, extension: 'png' }),
  }
}

export type BirthdayEntry = BirthdayMember & { month: number; day: number; daysUntil: number }

/** Everything the dashboard's birthday page shows, from the in-memory member cache. */
export async function getBirthdayOverview(): Promise<
  Result<{ birthdays: BirthdayEntry[]; members: BirthdayMember[]; timeZone: string }>
> {
  await primeMemberCache()
  const guild = await getGuild()
  const from = today()

  const birthdays = listBirthdays()
    .flatMap((birthday) => {
      const member = guild.members.cache.get(birthday.memberId)
      return member
        ? [
            {
              ...toBirthdayMember(member),
              month: birthday.month,
              day: birthday.day,
              daysUntil: daysUntil(birthday, from),
            },
          ]
        : []
    })
    .sort((a, b) => a.daysUntil - b.daysUntil)

  const members = [...guild.members.cache.values()]
    .filter((member) => !member.user.bot)
    .map(toBirthdayMember)
    .sort((a, b) => a.displayName.localeCompare(b.displayName))

  return ok({ birthdays, members, timeZone: env.BIRTHDAY_TIMEZONE })
}

// ---------------------------------------------------------------------------
// Daily announcement
// ---------------------------------------------------------------------------

let running = false

/**
 * Posts one message for everyone whose birthday is today and who has not been wished a
 * happy birthday yet this year. Safe to call as often as you like: a birthday is marked
 * only after the message is sent, so a failed post is retried on the next run, and a
 * restart never posts twice.
 */
export async function announceBirthdays(): Promise<void> {
  if (running || !isReady()) return
  running = true

  try {
    const channelId = getSettings().birthdayChannelId
    if (!channelId) return

    const date = today()
    const due = listDueBirthdays(date)
    if (due.length === 0) return

    const guild = await getGuild()
    const members: GuildMember[] = []

    for (const birthday of due) {
      const member =
        guild.members.cache.get(birthday.memberId) ??
        (await guild.members.fetch(birthday.memberId).catch(() => null))

      // Left while the bot was offline, so guildMemberRemove never cleaned up.
      if (!member) removeBirthday(birthday.memberId)
      else if (!member.user.bot) members.push(member)
    }
    if (members.length === 0) return

    const channel =
      guild.channels.cache.get(channelId) ??
      (await guild.channels.fetch(channelId).catch(() => null))

    if (!channel?.isTextBased()) {
      console.warn('[birthdays] the configured birthday channel no longer exists')
      return
    }

    const me = guild.members.me ?? (await guild.members.fetchMe())
    const canSend = channel
      .permissionsFor(me)
      ?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])

    if (!canSend) {
      console.warn(`[birthdays] the bot cannot post in #${channel.name}`)
      return
    }

    const mentions = new Intl.ListFormat(DEFAULT_LOCALE, { type: 'conjunction' }).format(
      members.map((member) => member.toString()),
    )

    const message = await channel.send({
      content: t('birthday.announcement', { lng: DEFAULT_LOCALE, count: members.length, mentions }),
      // Ping the birthday people and nobody else, whatever the bot's permissions.
      allowedMentions: { users: members.map((member) => member.id) },
    })

    for (const member of members) markBirthdayAnnounced(member.id, date.year)

    recordAudit({
      action: 'birthday.announce',
      source: 'system',
      targetId: channel.id,
      targetName: `#${channel.name}`,
      detail: {
        memberIds: members.map((member) => member.id),
        memberNames: members.map((member) => member.displayName),
        messageId: message.id,
      },
    })

    console.log(`[birthdays] announced ${members.length} birthday(s) in #${channel.name}`)
  } catch (error) {
    console.error('[birthdays] announcement failed:', error)
  } finally {
    running = false
  }
}
