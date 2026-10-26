import { db } from './index'
import type { OpenRow } from './activity'

/**
 * A gap shorter than this joins the sessions either side of it, so a reconnect stays one
 * session. Shorter than the games' window: a gap here is often time spent deafened or AFK.
 */
const RESUME_WINDOW_MS = 2 * 60_000

/** Shorter sessions are left out of the totals: a quick hop in and out, not time together. */
export const MIN_VOICE_SESSION_MS = 60_000

/**
 * Only the member's latest session is resumed, and only in the same channel, so moving
 * A → B → A never lets A's session stretch over the time spent in B.
 */
const lastVoiceSession = db.query<
  { id: number; channel_id: string; started_at: number; ended_at: number },
  { member_id: string }
>(
  `SELECT id, channel_id, started_at, ended_at FROM voice_sessions
   WHERE member_id = :member_id ORDER BY ended_at DESC LIMIT 1`,
)
const insertVoiceSession = db.query<
  { id: number },
  { member_id: string; channel_id: string; channel_name: string; now: number }
>(
  `INSERT INTO voice_sessions (member_id, channel_id, channel_name, started_at, ended_at)
   VALUES (:member_id, :channel_id, :channel_name, :now, :now) RETURNING id`,
)
const resumeVoiceSession = db.query<void, { id: number; channel_name: string; now: number }>(
  'UPDATE voice_sessions SET ended_at = :now, channel_name = :channel_name WHERE id = :id',
)
const touchVoiceSession = db.query<void, { id: number; now: number }>(
  'UPDATE voice_sessions SET ended_at = :now WHERE id = :id',
)

export function openVoiceSession(
  memberId: string,
  channelId: string,
  channelName: string,
  now: number,
): OpenRow {
  const last = lastVoiceSession.get({ member_id: memberId })
  if (last && last.channel_id === channelId && last.ended_at >= now - RESUME_WINDOW_MS) {
    resumeVoiceSession.run({ id: last.id, channel_name: channelName, now })
    return { id: last.id, startedAt: last.started_at }
  }
  const row = insertVoiceSession.get({
    member_id: memberId,
    channel_id: channelId,
    channel_name: channelName,
    now,
  })!
  return { id: row.id, startedAt: now }
}

/**
 * Moves the end of open sessions up to now. As with games, an open row's `ended_at` is the
 * last time it was seen, so after a crash or restart it is already closed about right.
 */
export const touchVoiceSessions = db.transaction((ids: number[], now: number) => {
  for (const id of ids) touchVoiceSession.run({ id, now })
})

export type VoiceTotal = {
  memberId: string
  channelId: string
  /** The name it had in the member's latest session there, for channels since deleted. */
  channelName: string
  sessions: number
  ms: number
}

/**
 * Time per member and channel since a moment; a session that began earlier counts from it.
 * `channel_name` is a bare column beside the one MAX(), so SQLite takes it from the latest row.
 */
const selectVoiceTotals = db.query<
  { member_id: string; channel_id: string; channel_name: string; sessions: number; ms: number },
  { since: number; min: number }
>(
  `SELECT member_id, channel_id, channel_name, MAX(ended_at) AS last,
     COUNT(*) AS sessions,
     SUM(ended_at - MAX(started_at, :since)) AS ms
   FROM voice_sessions
   WHERE ended_at > :since AND ended_at - started_at >= :min
   GROUP BY member_id, channel_id`,
)

export function listVoiceTotals(since: number): VoiceTotal[] {
  return selectVoiceTotals.all({ since, min: MIN_VOICE_SESSION_MS }).map((row) => ({
    memberId: row.member_id,
    channelId: row.channel_id,
    channelName: row.channel_name,
    sessions: row.sessions,
    ms: row.ms,
  }))
}
