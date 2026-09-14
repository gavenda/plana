const RELATIVE = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
const ABSOLUTE = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' })

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
