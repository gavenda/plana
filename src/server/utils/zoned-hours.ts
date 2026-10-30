const HOUR_MS = 3_600_000

/** Every zone's offset is a whole number of quarter-hours, so its local hours start on one. */
const QUARTER_HOUR_MS = 900_000

/** Monday first, as `Intl` names them in English. */
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export type HourSlot = {
  /** The local date, as YYYY-MM-DD. */
  date: string
  /** 0 for Monday through 6 for Sunday. */
  weekday: number
  hour: number
  /** When this local hour ends. */
  end: number
}

/**
 * Where a moment falls in a zone's calendar, and when its local hour ends. The end is worked
 * out from the local minute and second, so zones offset by half an hour and DST both hold.
 *
 * Every moment in a UTC quarter-hour shares a slot, so each is worked out once and kept:
 * `Intl` is slow, and a year of plays asks hundreds of thousands of times. Make one per
 * request, since the cache lives as long as the slotter.
 */
export function makeSlotter(timeZone: string): (at: number) => HourSlot {
  const slotOf = zonedSlot(timeZone)
  const cache = new Map<number, HourSlot>()
  return (at) => {
    const quarter = Math.floor(at / QUARTER_HOUR_MS)
    let slot = cache.get(quarter)
    if (!slot) {
      slot = slotOf(quarter * QUARTER_HOUR_MS)
      cache.set(quarter, slot)
    }
    return slot
  }
}

function zonedSlot(timeZone: string): (at: number) => HourSlot {
  const format = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  })
  return (at) => {
    const parts = format.formatToParts(at)
    const part = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((entry) => entry.type === type)?.value ?? ''
    const minute = Number(part('minute'))
    const second = Number(part('second'))
    return {
      date: `${part('year')}-${part('month')}-${part('day')}`,
      weekday: WEEKDAYS.indexOf(part('weekday')),
      hour: Number(part('hour')),
      end: at - (at % 1000) - second * 1000 - minute * 60_000 + HOUR_MS,
    }
  }
}

/** Walks a span local hour by local hour, handing each piece and its length to `visit`. */
export function eachHour(
  slot: (at: number) => HourSlot,
  start: number,
  end: number,
  visit: (slot: HourSlot, ms: number) => void,
): void {
  let at = start
  while (at < end) {
    const here = slot(at)
    const next = Math.min(here.end, end)
    visit(here, next - at)
    at = next
  }
}

/** A YYYY-MM-DD date moved by a number of days. */
export function shiftDate(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(Date.UTC(year!, month! - 1, day! + days)).toISOString().slice(0, 10)
}
