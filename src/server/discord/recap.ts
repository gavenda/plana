import {
  escapeMarkdown,
  MessageFlags,
  PermissionFlagsBits,
  TextDisplayBuilder,
  type GuildMember,
} from 'discord.js'

import { getGuild, isReady } from './client'
import { today, type CalendarDate } from './birthdays'
import { primeMemberCache } from './service'
import { listGameTotals, listTrackTotals, type TrackTotal } from '../db/activity'
import { recordAudit } from '../db/audit'
import { isRecapPosted, markRecapPosted } from '../db/recaps'
import { getSettings } from '../db/settings'
import { listChannelActiveTotals, listVoiceTotals } from '../db/voice'
import { env } from '../env'
import { DEFAULT_LOCALE, t, tlList } from '../i18n'

const DAY_MS = 86_400_000

/** The recap posts on Sundays (0) at 18:00 in the bot's time zone, covering the 7 days before. */
const RECAP_WEEKDAY = 0
const RECAP_HOUR = 18

/** A recap missed while the bot was down still posts if it is back within this long. */
const CATCH_UP_MS = DAY_MS

/** Entries per ranked section. */
const TOP = 3

/** New members named before the rest are counted, to stay well under the 4000 characters a message allows. */
const MAX_NEW_MEMBERS = 10

const TITLE_LIMIT = 80

// ---------------------------------------------------------------------------
// Schedule
// ---------------------------------------------------------------------------

/** How far the zone is ahead of UTC at a moment, in milliseconds. */
function zoneOffset(at: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(at)
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((entry) => entry.type === type)?.value)

  const local = Date.UTC(
    part('year'),
    part('month') - 1,
    part('day'),
    part('hour'),
    part('minute'),
    part('second'),
  )
  return local - Math.floor(at / 1000) * 1000
}

/** The moment a local date and hour fall on in a zone. Checked twice to land right across DST. */
function zonedTime(date: CalendarDate, hour: number, timeZone: string): number {
  const asUtc = Date.UTC(date.year, date.month - 1, date.day, hour)
  const first = asUtc - zoneOffset(asUtc, timeZone)
  return asUtc - zoneOffset(first, timeZone)
}

function shift(date: CalendarDate, days: number): CalendarDate {
  const moved = new Date(Date.UTC(date.year, date.month - 1, date.day + days))
  return { year: moved.getUTCFullYear(), month: moved.getUTCMonth() + 1, day: moved.getUTCDate() }
}

function isoDate(date: CalendarDate): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.year}-${pad(date.month)}-${pad(date.day)}`
}

export type RecapWeek = {
  /** The local date the week ends on, as YYYY-MM-DD. Identifies the recap. */
  week: string
  endDate: CalendarDate
  /** The 7 days the recap covers, as timestamps. */
  start: number
  end: number
}

/** The most recent scheduled recap at or before `now`, whether or not it has been posted. */
export function latestRecapWeek(now = Date.now(), timeZone = env.BIRTHDAY_TIMEZONE): RecapWeek {
  const date = today(timeZone, new Date(now))
  const weekday = new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay()

  let endDate = shift(date, -((weekday - RECAP_WEEKDAY + 7) % 7))
  let end = zonedTime(endDate, RECAP_HOUR, timeZone)
  if (end > now) {
    endDate = shift(endDate, -7)
    end = zonedTime(endDate, RECAP_HOUR, timeZone)
  }

  const start = zonedTime(shift(endDate, -7), RECAP_HOUR, timeZone)
  return { week: isoDate(endDate), endDate, start, end }
}

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

/** "45m", "3h 20m", "12h". Minutes stop mattering past ten hours. */
function duration(ms: number): string {
  const minutes = Math.round(ms / 60_000)
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours === 0) return `${rest}m`
  if (rest === 0 || hours >= 10) return `${hours}h`
  return `${hours}h ${rest}m`
}

function clip(value: string): string {
  const text = value.length > TITLE_LIMIT ? `${value.slice(0, TITLE_LIMIT - 1)}…` : value
  return escapeMarkdown(text)
}

/** Sums time per key, most first, keeping the members behind each. */
function rank<T extends { memberId: string; ms: number }>(
  rows: T[],
  key: (row: T) => string,
): { key: string; score: number; members: Set<string> }[] {
  const totals = new Map<string, { key: string; score: number; members: Set<string> }>()
  for (const row of rows) {
    const id = key(row)
    const entry = totals.get(id) ?? { key: id, score: 0, members: new Set<string>() }
    entry.score += row.ms
    entry.members.add(row.memberId)
    totals.set(id, entry)
  }
  return [...totals.values()].sort((a, b) => b.score - a.score)
}

function voiceSection(week: RecapWeek, members: Map<string, GuildMember>): string[] {
  const perMember = rank(
    listVoiceTotals(week.start).filter((row) => members.has(row.memberId)),
    (row) => row.memberId,
  )
  if (perMember.length === 0) return []

  const lng = DEFAULT_LOCALE
  const total = perMember.reduce((sum, entry) => sum + entry.score, 0)
  const lines = [
    t('recap.voice_title', { lng }),
    t('recap.voice_summary', { lng, total: duration(total), count: perMember.length }),
  ]

  const busiest = [...listChannelActiveTotals(week.start)].sort((a, b) => b[1] - a[1])[0]
  if (busiest) {
    lines.push(
      t('recap.voice_busiest', { lng, channel: `<#${busiest[0]}>`, time: duration(busiest[1]) }),
    )
  }

  perMember.slice(0, TOP).forEach((entry, index) => {
    lines.push(
      t('recap.voice_line', {
        lng,
        rank: index + 1,
        member: members.get(entry.key)!.toString(),
        time: duration(entry.score),
      }),
    )
  })
  return lines
}

function gamesSection(week: RecapWeek): string[] {
  const games = rank(listGameTotals(week.start), (row) => row.game)
  if (games.length === 0) return []

  const lng = DEFAULT_LOCALE
  return [
    t('recap.games_title', { lng }),
    ...games.slice(0, TOP).map((entry, index) =>
      t('recap.game_line', {
        lng,
        rank: index + 1,
        game: clip(entry.key),
        time: duration(entry.score),
        count: entry.members.size,
      }),
    ),
  ]
}

function musicSection(week: RecapWeek): string[] {
  const totals = new Map<string, { track: TrackTotal; plays: number; ms: number }>()
  for (const row of listTrackTotals(week.start)) {
    const entry = totals.get(row.id) ?? { track: row, plays: 0, ms: 0 }
    entry.plays += row.plays
    entry.ms += row.ms
    totals.set(row.id, entry)
  }
  // Plays first, time spent listening to break ties.
  const tracks = [...totals.values()].sort((a, b) => b.plays - a.plays || b.ms - a.ms)
  if (tracks.length === 0) return []

  const lng = DEFAULT_LOCALE
  return [
    t('recap.music_title', { lng }),
    ...tracks.slice(0, TOP).map((entry, index) =>
      t('recap.track_line', {
        lng,
        rank: index + 1,
        title: clip(entry.track.title),
        artist: entry.track.artist
          ? t('recap.track_artist', { lng, artist: clip(entry.track.artist) })
          : '',
        plays: t('recap.plays', { lng, count: entry.plays }),
      }),
    ),
  ]
}

function newMembersSection(week: RecapWeek, members: Map<string, GuildMember>): string[] {
  const { triageRoleId } = getSettings()
  const joined = [...members.values()]
    .filter((member) => (member.joinedTimestamp ?? 0) >= week.start)
    // Still waiting in triage means not admitted yet.
    .filter((member) => !triageRoleId || !member.roles.cache.has(triageRoleId))
    .sort((a, b) => (a.joinedTimestamp ?? 0) - (b.joinedTimestamp ?? 0))
  if (joined.length === 0) return []

  const lng = DEFAULT_LOCALE
  const named: string[] = joined.slice(0, MAX_NEW_MEMBERS).map((member) => member.toString())
  if (joined.length > MAX_NEW_MEMBERS) {
    named.push(t('recap.members_more', { lng, count: joined.length - MAX_NEW_MEMBERS }))
  }

  return [
    t('recap.members_title', { lng }),
    t('recap.members_line', {
      lng,
      count: joined.length,
      mentions: new Intl.ListFormat(lng, { type: 'conjunction' }).format(named),
    }),
  ]
}

/** The parts of the recap, laid out straight in a Components V2 message with no container. */
export type RecapComponents = TextDisplayBuilder[]

function text(content: string): TextDisplayBuilder {
  return new TextDisplayBuilder().setContent(content)
}

/** The recap as Components V2 parts, or null for a week with nothing to report. */
export async function buildRecap(week: RecapWeek): Promise<RecapComponents | null> {
  await primeMemberCache()
  const guild = await getGuild()
  const members = new Map(
    [...guild.members.cache.values()]
      .filter((member) => !member.user.bot)
      .map((member) => [member.id, member]),
  )

  const sections = [
    voiceSection(week, members),
    gamesSection(week),
    musicSection(week),
    newMembersSection(week, members),
  ].filter((section) => section.length > 0)
  if (sections.length === 0) return null

  const lng = DEFAULT_LOCALE
  const intros = tlList('recap.intros', lng)
  // The same week always gets the same line, so a re-post reads the same.
  const intro = intros[Math.floor(week.end / (7 * DAY_MS)) % Math.max(intros.length, 1)] ?? ''
  const date = new Intl.DateTimeFormat(lng, {
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(Date.UTC(week.endDate.year, week.endDate.month - 1, week.endDate.day))

  // The heading, then each section as its own text display.
  return [
    text([t('recap.title', { lng, date }), intro].join('\n')),
    ...sections.map((section) => text(section.join('\n'))),
  ]
}

// ---------------------------------------------------------------------------
// Posting
// ---------------------------------------------------------------------------

let running = false

/** The week last found empty, so a quiet week is not rebuilt on every check. */
let emptyWeek: string | null = null

/**
 * Posts the weekly recap in the configured channel once the week's scheduled time has passed.
 * Safe to call as often as you like: a week is marked only after its message is sent, so a
 * failed post is retried on the next run, and a restart never posts twice.
 */
export async function postWeeklyRecap(now = Date.now()): Promise<void> {
  if (running || !isReady()) return
  running = true

  try {
    const channelId = getSettings().recapChannelId
    if (!channelId) return

    const week = latestRecapWeek(now)
    if (now - week.end > CATCH_UP_MS) return
    if (week.week === emptyWeek || isRecapPosted(week.week)) return

    const guild = await getGuild()
    const channel =
      guild.channels.cache.get(channelId) ??
      (await guild.channels.fetch(channelId).catch(() => null))

    if (!channel?.isTextBased()) {
      console.warn('[recap] the configured recap channel no longer exists')
      return
    }

    const me = guild.members.me ?? (await guild.members.fetchMe())
    const canSend = channel
      .permissionsFor(me)
      ?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])

    if (!canSend) {
      console.warn(`[recap] the bot cannot post in #${channel.name}`)
      return
    }

    const components = await buildRecap(week)
    if (!components) {
      emptyWeek = week.week
      console.log(`[recap] nothing to report for the week ending ${week.week}`)
      return
    }

    const message = await channel.send({
      components,
      flags: MessageFlags.IsComponentsV2,
      // Names members without pinging anyone.
      allowedMentions: { parse: [] },
    })

    markRecapPosted(week.week, channel.id, message.id)

    recordAudit({
      action: 'recap.post',
      source: 'system',
      targetId: channel.id,
      targetName: `#${channel.name}`,
      detail: { week: week.week, messageId: message.id },
    })

    console.log(`[recap] posted the week ending ${week.week} in #${channel.name}`)
  } catch (error) {
    console.error('[recap] posting failed:', error)
  } finally {
    running = false
  }
}
