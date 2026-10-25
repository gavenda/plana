/** What the birthday endpoints return; see src/server/discord/birthdays.ts. */

export type BirthdayMember = {
  id: string
  username: string
  displayName: string
  /** Their name's colour in Discord (highest coloured role); #000000 for none. */
  color?: string
  avatarUrl: string
}

export type BirthdayEntry = BirthdayMember & { month: number; day: number; daysUntil: number }

export type BirthdayOverview = {
  birthdays: BirthdayEntry[]
  members: BirthdayMember[]
  timeZone: string
}

/** The next few birthdays, and how many fall in this calendar month, for Overview. */
export type UpcomingBirthdays = {
  birthdays: BirthdayEntry[]
  thisMonth: number
  timeZone: string
}

/** "Today", "Tomorrow" or "In 12 days". */
export function formatUntil(days: number): string {
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  return `In ${days} days`
}
