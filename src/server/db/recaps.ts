import { db } from './index'

const selectRecap = db.query<{ week: string }, { week: string }>(
  'SELECT week FROM recaps WHERE week = :week',
)
const insertRecap = db.query<
  void,
  { week: string; channel_id: string; message_id: string; posted_at: number }
>(
  `INSERT INTO recaps (week, channel_id, message_id, posted_at)
   VALUES (:week, :channel_id, :message_id, :posted_at)
   ON CONFLICT (week) DO NOTHING`,
)

/** `week` is the local date the week ends on, as YYYY-MM-DD. */
export function isRecapPosted(week: string): boolean {
  return selectRecap.get({ week }) != null
}

export function markRecapPosted(week: string, channelId: string, messageId: string): void {
  insertRecap.run({ week, channel_id: channelId, message_id: messageId, posted_at: Date.now() })
}
