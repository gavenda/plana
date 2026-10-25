import { db } from './index'

export type Birthday = {
  memberId: string
  month: number
  day: number
  lastAnnouncedYear: number | null
}

type Row = {
  member_id: string
  month: number
  day: number
  created_at: number
  updated_at: number
  last_announced_year: number | null
}

/**
 * `last_announced_year` is deliberately kept when someone changes their date, so moving
 * a birthday onto today cannot earn a second announcement in the same year.
 */
const upsert = db.query<void, { member_id: string; month: number; day: number; now: number }>(
  `INSERT INTO birthdays (member_id, month, day, created_at, updated_at)
   VALUES (:member_id, :month, :day, :now, :now)
   ON CONFLICT (member_id) DO UPDATE SET
     month      = excluded.month,
     day        = excluded.day,
     updated_at = excluded.updated_at`,
)
const remove = db.query<void, { member_id: string }>(
  'DELETE FROM birthdays WHERE member_id = :member_id',
)
const selectOne = db.query<Row, { member_id: string }>(
  'SELECT * FROM birthdays WHERE member_id = :member_id',
)
const selectAll = db.query<Row, []>('SELECT * FROM birthdays ORDER BY month, day')
const selectDue = db.query<Row, { month: number; day: number; year: number }>(
  `SELECT * FROM birthdays
   WHERE month = :month AND day = :day
     AND (last_announced_year IS NULL OR last_announced_year < :year)`,
)
const markAnnounced = db.query<void, { member_id: string; year: number }>(
  'UPDATE birthdays SET last_announced_year = :year WHERE member_id = :member_id',
)

function toBirthday(row: Row): Birthday {
  return {
    memberId: row.member_id,
    month: row.month,
    day: row.day,
    lastAnnouncedYear: row.last_announced_year,
  }
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

/** Days in a month, counting February as 29 so a leap-day birthday can be stored. */
export function maxDayOf(month: number): number {
  return [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] ?? 0
}

export function isValidBirthday(month: number, day: number): boolean {
  return Number.isInteger(month) && Number.isInteger(day) && day >= 1 && day <= maxDayOf(month)
}

export function setBirthday(memberId: string, month: number, day: number): void {
  if (!isValidBirthday(month, day)) throw new RangeError(`invalid birthday ${month}/${day}`)
  upsert.run({ member_id: memberId, month, day, now: Date.now() })
}

export function removeBirthday(memberId: string): boolean {
  const existed = selectOne.get({ member_id: memberId }) != null
  remove.run({ member_id: memberId })
  return existed
}

export function getBirthday(memberId: string): Birthday | null {
  const row = selectOne.get({ member_id: memberId })
  return row ? toBirthday(row) : null
}

export function listBirthdays(): Birthday[] {
  return selectAll.all().map(toBirthday)
}

/**
 * Birthdays to celebrate on a calendar date that have not been celebrated this year.
 * In a non-leap year, 29 February birthdays are celebrated on the 28th.
 */
export function listDueBirthdays(date: { year: number; month: number; day: number }): Birthday[] {
  const due = selectDue.all(date)
  if (date.month === 2 && date.day === 28 && !isLeapYear(date.year)) {
    due.push(...selectDue.all({ ...date, day: 29 }))
  }
  return due.map(toBirthday)
}

export function markBirthdayAnnounced(memberId: string, year: number): void {
  markAnnounced.run({ member_id: memberId, year })
}
