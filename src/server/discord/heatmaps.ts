import {
  firstGameAt,
  firstTrackAt,
  listPlayingSpans,
  listTrackSpans,
  type Span,
} from '../db/activity'
import { firstVoiceAt, listVoiceIntervals } from '../db/voice'
import { env } from '../env'
import { eachHour, makeSlotter } from '../utils/zoned-hours'
import { checkpointActivity, periodStart } from './activity'
import { ok, type Result } from './service'
import { checkpointVoice } from './voice'

/** What a heatmap counts: members in voice, playing a game, or listening on Spotify. */
export type HeatmapKind = 'voice' | 'games' | 'music'

const WEEKDAYS = 7

export type Heatmap = {
  kind: HeatmapKind
  /** Null for all time. */
  days: number | null
  /** The zone the hours are in. */
  timeZone: string
  /**
   * How many members were doing it on average, by weekday (Monday first) then hour of the day:
   * each hour's time added up, divided by how many times that hour came round in the period.
   */
  grid: number[][]
}

const SOURCES: Record<
  HeatmapKind,
  { spans: (since: number) => Span[]; first: () => number | null }
> = {
  voice: { spans: listVoiceIntervals, first: firstVoiceAt },
  games: { spans: listPlayingSpans, first: firstGameAt },
  music: { spans: listTrackSpans, first: firstTrackAt },
}

/** When the server is in voice, playing or listening, by weekday and hour, over the last `days`. */
export function getHeatmap(kind: HeatmapKind, days: number | null): Result<Heatmap> {
  const now = Date.now()
  // Open sessions count up to this moment, not to their last checkpoint.
  if (kind === 'voice') checkpointVoice(now)
  else checkpointActivity(now)

  const timeZone = env.BIRTHDAY_TIMEZONE
  const slot = makeSlotter(timeZone)
  const empty = () => Array.from({ length: WEEKDAYS }, () => Array<number>(24).fill(0))
  const source = SOURCES[kind]

  // An hour counts from the first time anything was recorded, so a young server isn't
  // averaged over weeks it never had.
  const since = Math.max(periodStart(days, now), source.first() ?? now)

  const time = empty()
  for (const span of source.spans(since)) {
    eachHour(slot, span.start, Math.min(span.end, now), ({ weekday, hour }, ms) => {
      time[weekday]![hour]! += ms
    })
  }

  const seen = empty()
  eachHour(slot, since, now, ({ weekday, hour }, ms) => {
    seen[weekday]![hour]! += ms
  })

  const grid = time.map((hours, weekday) =>
    hours.map((ms, hour) => {
      const covered = seen[weekday]![hour]!
      // Under a minute of the hour seen is too little to average over.
      return covered >= 60_000 ? ms / covered : 0
    }),
  )

  return ok({ kind, days, timeZone, grid })
}
