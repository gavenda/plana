/** Dates without a year, as birthdays are kept: a month (1–12) and a day. */

export const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

/** February counts as 29 so a leap-day birthday can be saved. */
export const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

export function daysIn(month: number): number {
  return DAYS_IN_MONTH[month - 1] ?? 31
}

export function formatMonthDay(month: number, day: number): string {
  return `${MONTHS[month - 1]} ${day}`
}

/**
 * The weekday (0 = Sunday) a month starts on, in the year it next comes round: this year if it
 * is this month or later, next year if it has passed. Feb 29 is kept even in a common year, as
 * the last cell after the 28th.
 */
export function firstWeekday(month: number, today = new Date()): number {
  const year = month < today.getMonth() + 1 ? today.getFullYear() + 1 : today.getFullYear()
  return new Date(year, month - 1, 1).getDay()
}

/**
 * Parses what someone typed as MM/DD (also M/D, MM-DD or MM.DD) into a valid month and day,
 * or null.
 */
export function parseMonthDay(text: string): { month: number; day: number } | null {
  const match = /^\s*(\d{1,2})\s*[/.-]\s*(\d{1,2})\s*$/.exec(text)
  if (!match) return null
  const month = Number(match[1])
  const day = Number(match[2])
  if (month < 1 || month > 12 || day < 1 || day > daysIn(month)) return null
  return { month, day }
}
