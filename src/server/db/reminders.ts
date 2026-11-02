import { db } from './index'

export type Reminder = {
  id: number
  memberId: string
  /** Where it was set, named in the reminder and used if a DM can't be sent. */
  channelId: string
  text: string
  createdAt: number
  dueAt: number
}

type ReminderRow = {
  id: number
  member_id: string
  channel_id: string
  text: string
  created_at: number
  due_at: number
}

const insertReminder = db.query<{ id: number }, Omit<ReminderRow, 'id'>>(
  `INSERT INTO reminders (member_id, channel_id, text, created_at, due_at)
   VALUES (:member_id, :channel_id, :text, :created_at, :due_at) RETURNING id`,
)
const selectMemberReminders = db.query<ReminderRow, { member_id: string }>(
  'SELECT * FROM reminders WHERE member_id = :member_id ORDER BY due_at',
)
const selectDue = db.query<ReminderRow, { now: number; limit: number }>(
  'SELECT * FROM reminders WHERE due_at <= :now ORDER BY due_at LIMIT :limit',
)
const deleteReminder = db.query<ReminderRow, { id: number }>(
  'DELETE FROM reminders WHERE id = :id RETURNING *',
)
const deleteMemberReminder = db.query<ReminderRow, { id: number; member_id: string }>(
  'DELETE FROM reminders WHERE id = :id AND member_id = :member_id RETURNING *',
)

function toReminder(row: ReminderRow): Reminder {
  return {
    id: row.id,
    memberId: row.member_id,
    channelId: row.channel_id,
    text: row.text,
    createdAt: row.created_at,
    dueAt: row.due_at,
  }
}

export function addReminder(input: Omit<Reminder, 'id'>): number {
  return insertReminder.get({
    member_id: input.memberId,
    channel_id: input.channelId,
    text: input.text,
    created_at: input.createdAt,
    due_at: input.dueAt,
  })!.id
}

/** A member's waiting reminders, soonest first. */
export function listMemberReminders(memberId: string): Reminder[] {
  return selectMemberReminders.all({ member_id: memberId }).map(toReminder)
}

export function listDueReminders(now: number, limit: number): Reminder[] {
  return selectDue.all({ now, limit }).map(toReminder)
}

/** Takes a reminder off the list; null if it was already gone. */
export function takeReminder(id: number): Reminder | null {
  const row = deleteReminder.get({ id })
  return row ? toReminder(row) : null
}

/** Cancels one of a member's own reminders; null if they have none by that ID. */
export function cancelReminder(id: number, memberId: string): Reminder | null {
  const row = deleteMemberReminder.get({ id, member_id: memberId })
  return row ? toReminder(row) : null
}
