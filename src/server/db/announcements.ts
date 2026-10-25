import { db } from './index'

export type JoinAnnouncement = {
  memberId: string
  channelId: string
  messageId: string
  /** When the card was posted, which is when the member reached triage. */
  createdAt: number
  resolvedAt: number | null
  /** When staff were reminded this member is still waiting. Once per stay in triage. */
  remindedAt: number | null
}

type Row = {
  member_id: string
  channel_id: string
  message_id: string
  created_at: number
  resolved_at: number | null
  reminded_at: number | null
}

/** A fresh card starts a fresh stay in triage, so it clears both resolution and reminder. */
const upsert = db.query<void, Omit<Row, 'resolved_at' | 'reminded_at'>>(
  `INSERT INTO join_announcements (member_id, channel_id, message_id, created_at)
   VALUES (:member_id, :channel_id, :message_id, :created_at)
   ON CONFLICT (member_id) DO UPDATE SET
     channel_id  = excluded.channel_id,
     message_id  = excluded.message_id,
     created_at  = excluded.created_at,
     resolved_at = NULL,
     reminded_at = NULL`,
)
const selectOne = db.query<Row, { member_id: string }>(
  'SELECT * FROM join_announcements WHERE member_id = :member_id',
)
const markResolved = db.query<void, { member_id: string; resolved_at: number }>(
  `UPDATE join_announcements SET resolved_at = :resolved_at
   WHERE member_id = :member_id AND resolved_at IS NULL`,
)
const markReminded = db.query<void, { member_id: string; reminded_at: number }>(
  'UPDATE join_announcements SET reminded_at = :reminded_at WHERE member_id = :member_id',
)

function toAnnouncement(row: Row): JoinAnnouncement {
  return {
    memberId: row.member_id,
    channelId: row.channel_id,
    messageId: row.message_id,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
    remindedAt: row.reminded_at,
  }
}

export function rememberAnnouncement(input: {
  memberId: string
  channelId: string
  messageId: string
  /** When the card was posted. Its greeting is picked from this, so pass the same time. */
  createdAt: number
}): void {
  upsert.run({
    member_id: input.memberId,
    channel_id: input.channelId,
    message_id: input.messageId,
    created_at: input.createdAt,
  })
}

export function getAnnouncement(memberId: string): JoinAnnouncement | null {
  const row = selectOne.get({ member_id: memberId })
  return row ? toAnnouncement(row) : null
}

export function resolveAnnouncement(memberId: string): void {
  markResolved.run({ member_id: memberId, resolved_at: Date.now() })
}

export function markAnnouncementReminded(memberId: string): void {
  markReminded.run({ member_id: memberId, reminded_at: Date.now() })
}
