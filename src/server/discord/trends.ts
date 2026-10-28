import { listGameSpans, listMemberGameSpans, listTrackSpans, type Span } from '../db/activity'
import { listMemberVoiceSpans, listVoiceIntervals } from '../db/voice'
import { env } from '../env'
import { eachHour, makeSlotter, shiftDate } from '../utils/zoned-hours'
import { checkpointActivity } from './activity'
import { ok, type Result } from './service'
import { checkpointVoice } from './voice'

const DAY_MS = 86_400_000

/** How many days the charts cover, ending today. */
export const TREND_DAYS = 28

/** The window the headline compares: the last 7 days against the 7 before. */
const WEEK_MS = 7 * DAY_MS

export type TrendMetric = 'voice' | 'games' | 'music'

export type Trend = {
  /** Time per local day, oldest first; the last is today so far. */
  daily: number[]
  /** The last 7 days, to this moment. */
  week: number
  /** The 7 days before those. */
  previousWeek: number
}

export type DailyTrends = {
  timeZone: string
  /** The local dates the daily values are for, as YYYY-MM-DD, oldest first. */
  dates: string[]
  trends: Record<TrendMetric, Trend>
}

/** How much of the spans falls between two moments. */
function overlap(spans: Span[], from: number, to: number): number {
  let total = 0
  for (const span of spans) {
    const ms = Math.min(span.end, to) - Math.max(span.start, from)
    if (ms > 0) total += ms
  }
  return total
}

/**
 * Everyone's time added up per day, in the bot's time zone, for the last 4 weeks: hours in
 * voice, hours of games played and hours of music. Time on two games at once counts twice.
 */
export function getDailyTrends(now = Date.now()): Result<DailyTrends> {
  checkpointVoice(now)
  checkpointActivity(now)

  const timeZone = env.BIRTHDAY_TIMEZONE
  const slot = makeSlotter(timeZone)

  const today = slot(now).date
  const dates = Array.from({ length: TREND_DAYS }, (_, index) =>
    shiftDate(today, index - TREND_DAYS + 1),
  )
  const dayIndex = new Map(dates.map((date, index) => [date, index]))

  // A day more than the charts cover, so the first local day is whole in any zone.
  const since = now - (TREND_DAYS + 1) * DAY_MS

  function trend(spans: Span[]): Trend {
    const daily = Array<number>(TREND_DAYS).fill(0)
    for (const span of spans) {
      eachHour(slot, span.start, Math.min(span.end, now), ({ date }, ms) => {
        const index = dayIndex.get(date)
        if (index != null) daily[index]! += ms
      })
    }
    return {
      daily,
      week: overlap(spans, now - WEEK_MS, now),
      previousWeek: overlap(spans, now - 2 * WEEK_MS, now - WEEK_MS),
    }
  }

  return ok({
    timeZone,
    dates,
    trends: {
      voice: trend(listVoiceIntervals(since)),
      games: trend(listGameSpans(since)),
      music: trend(listTrackSpans(since)),
    },
  })
}

// ---------------------------------------------------------------------------
// One member's days
// ---------------------------------------------------------------------------

/** How many whole weeks a member's activity strip covers, before this one. */
export const STRIP_WEEKS = 26

export type MemberDay = {
  /** YYYY-MM-DD, local. */
  date: string
  voiceMs: number
  gameMs: number
  /** Time in voice or in a game, with the two counted once where they overlap. */
  activeMs: number
}

export type MemberActivity = {
  timeZone: string
  /** Oldest first, starting on a Monday; the last is today so far. */
  days: MemberDay[]
}

/** Spans merged so overlapping time counts once, in start order. */
function union(spans: Span[]): Span[] {
  const sorted = [...spans].sort((a, b) => a.start - b.start)
  const merged: Span[] = []
  for (const span of sorted) {
    const last = merged.at(-1)
    if (last && span.start <= last.end) last.end = Math.max(last.end, span.end)
    else merged.push({ ...span })
  }
  return merged
}

/**
 * A member's time in voice and in games per local day, for this week and the 26 before it,
 * for the activity strip on their profile.
 */
export function getMemberActivity(memberId: string, now = Date.now()): Result<MemberActivity> {
  checkpointVoice(now)
  checkpointActivity(now)

  const timeZone = env.BIRTHDAY_TIMEZONE
  const slot = makeSlotter(timeZone)
  const here = slot(now)

  // Back to the Monday 26 weeks before this week's.
  const count = STRIP_WEEKS * 7 + here.weekday + 1
  const dates = Array.from({ length: count }, (_, index) => shiftDate(here.date, index - count + 1))
  const dayIndex = new Map(dates.map((date, index) => [date, index]))
  const since = now - (count + 1) * DAY_MS

  function perDay(spans: Span[]): number[] {
    const totals = Array<number>(count).fill(0)
    for (const span of spans) {
      eachHour(slot, span.start, Math.min(span.end, now), ({ date }, ms) => {
        const index = dayIndex.get(date)
        if (index != null) totals[index]! += ms
      })
    }
    return totals
  }

  const voice = listMemberVoiceSpans(memberId, since)
  const games = listMemberGameSpans(memberId, since)
  const voiceDays = perDay(voice)
  const gameDays = perDay(games)
  const activeDays = perDay(union([...voice, ...games]))

  return ok({
    timeZone,
    days: dates.map((date, index) => ({
      date,
      voiceMs: voiceDays[index]!,
      gameMs: gameDays[index]!,
      activeMs: activeDays[index]!,
    })),
  })
}
