const RELATIVE = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
const ABSOLUTE = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' })
const DAY = new Intl.DateTimeFormat('en', { weekday: 'long', day: 'numeric', month: 'long' })
const DAY_WITH_YEAR = new Intl.DateTimeFormat('en', { dateStyle: 'long' })
const TIME = new Intl.DateTimeFormat('en', { timeStyle: 'short' })

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 31_536_000_000],
  ['month', 2_592_000_000],
  ['week', 604_800_000],
  ['day', 86_400_000],
  ['hour', 3_600_000],
  ['minute', 60_000],
]

export function relativeTime(timestamp: number | null): string {
  if (timestamp == null) return 'unknown'

  const delta = timestamp - Date.now()
  const magnitude = Math.abs(delta)

  for (const [unit, ms] of UNITS) {
    if (magnitude >= ms) return RELATIVE.format(Math.round(delta / ms), unit)
  }
  return 'just now'
}

export function absoluteTime(timestamp: number | null): string {
  return timestamp == null ? 'unknown' : ABSOLUTE.format(timestamp)
}

/** Midnight of the local day a timestamp falls on, for grouping by day. */
export function startOfDay(timestamp: number): number {
  const date = new Date(timestamp)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

/** "Today", "Yesterday", "Monday 20 October", or with the year once it isn't this year's. */
export function dayLabel(timestamp: number): string {
  const day = startOfDay(timestamp)
  const today = startOfDay(Date.now())
  if (day === today) return 'Today'
  // A millisecond before today's midnight is yesterday, whatever daylight saving did.
  if (day === startOfDay(today - 1)) return 'Yesterday'
  return new Date(day).getFullYear() === new Date(today).getFullYear()
    ? DAY.format(day)
    : DAY_WITH_YEAR.format(day)
}

export function clockTime(timestamp: number): string {
  return TIME.format(timestamp)
}

/** "45 min", "3.5 h" or "120 h": minutes under an hour, then hours, dropping decimals past ten. */
export function formatDuration(ms: number): string {
  const minutes = Math.round(ms / 60_000)
  if (minutes < 60) return `${Math.max(1, minutes)} min`
  const hours = ms / 3_600_000
  return `${hours.toLocaleString('en', { maximumFractionDigits: hours < 10 ? 1 : 0 })} h`
}
