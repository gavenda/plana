/** How far a zone's clock is ahead of UTC at a moment, in milliseconds. */
function offsetAt(at: number, timeZone: string): number {
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
  const wall = Date.UTC(
    part('year'),
    part('month') - 1,
    part('day'),
    part('hour') % 24,
    part('minute'),
    part('second'),
  )
  return wall - Math.floor(at / 1000) * 1000
}

/**
 * The moment a zone's clock reads a date and time. Days past the end of the month roll over,
 * as with `Date.UTC`. A time skipped by DST lands an hour later; a repeated one, on the second.
 */
export function zonedTime(
  date: { year: number; month: number; day: number },
  hour: number,
  minute: number,
  timeZone: string,
): number {
  const wall = Date.UTC(date.year, date.month - 1, date.day, hour, minute)
  const first = wall - offsetAt(wall, timeZone)
  const second = wall - offsetAt(first, timeZone)
  return Math.max(first, second)
}
