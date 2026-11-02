import { db } from './index'

const selectRole = db.query<{ role_id: string }, { game: string }>(
  'SELECT role_id FROM game_roles WHERE game = :game',
)
const upsertRole = db.query<void, { game: string; role_id: string }>(
  `INSERT INTO game_roles (game, role_id) VALUES (:game, :role_id)
   ON CONFLICT (game) DO UPDATE SET role_id = excluded.role_id`,
)
const deleteRole = db.query<void, { game: string }>('DELETE FROM game_roles WHERE game = :game')
const selectRoles = db.query<{ game: string; role_id: string }, []>(
  'SELECT game, role_id FROM game_roles',
)

const selectAnnounced = db.query<{ announced_at: number }, { channel_id: string; game: string }>(
  'SELECT announced_at FROM game_nights WHERE channel_id = :channel_id AND game = :game',
)
const upsertAnnounced = db.query<void, { channel_id: string; game: string; announced_at: number }>(
  `INSERT INTO game_nights (channel_id, game, announced_at) VALUES (:channel_id, :game, :announced_at)
   ON CONFLICT (channel_id, game) DO UPDATE SET announced_at = excluded.announced_at`,
)

/** The role pinged when a game night of this game starts, or null for no ping. */
export function getGameRole(game: string): string | null {
  return selectRole.get({ game })?.role_id ?? null
}

/** Every game with a ping role, by game name. */
export function listGameRoles(): Map<string, string> {
  return new Map(selectRoles.all().map((row) => [row.game, row.role_id]))
}

/** `null` stops pinging anyone for this game. */
export function setGameRole(game: string, roleId: string | null): void {
  if (roleId) upsertRole.run({ game, role_id: roleId })
  else deleteRole.run({ game })
}

/** When a game night of this game was last announced for this voice channel, or null if never. */
export function lastGameNight(channelId: string, game: string): number | null {
  return selectAnnounced.get({ channel_id: channelId, game })?.announced_at ?? null
}

export function markGameNight(channelId: string, game: string, at: number): void {
  upsertAnnounced.run({ channel_id: channelId, game, announced_at: at })
}

export type GameNightResponse = 'in' | 'out'

export type GameNightPost = {
  messageId: string
  channelId: string
  /** Where it's being played; null for a planned night until people gather for it. */
  voiceChannelId: string | null
  game: string
  /** The announcement as first posted; responses are added below it on each edit. */
  content: string
  postedAt: number
  /** When its players left voice (or it was cancelled), or null while it's still going. */
  endedAt: number | null
  /** When a night planned with /gamenight plan starts; null for one Plana noticed. */
  scheduledFor: number | null
  /** Who planned it. */
  hostId: string | null
  /** When the "starting soon" ping went out. */
  remindedAt: number | null
  /** Who cancelled it, if someone did. */
  cancelledBy: string | null
}

type PostRow = {
  message_id: string
  channel_id: string
  voice_channel_id: string
  game: string
  content: string
  posted_at: number
  ended_at: number | null
  scheduled_for: number | null
  host_id: string | null
  reminded_at: number | null
  cancelled_by: string | null
}

const insertPost = db.query<
  void,
  Pick<
    PostRow,
    | 'message_id'
    | 'channel_id'
    | 'voice_channel_id'
    | 'game'
    | 'content'
    | 'posted_at'
    | 'scheduled_for'
    | 'host_id'
    | 'reminded_at'
  >
>(
  `INSERT INTO game_night_posts
     (message_id, channel_id, voice_channel_id, game, content, posted_at, scheduled_for, host_id, reminded_at)
   VALUES
     (:message_id, :channel_id, :voice_channel_id, :game, :content, :posted_at, :scheduled_for, :host_id, :reminded_at)`,
)
const selectPost = db.query<PostRow, { message_id: string }>(
  'SELECT * FROM game_night_posts WHERE message_id = :message_id',
)
const selectOpenPosts = db.query<PostRow, []>(
  'SELECT * FROM game_night_posts WHERE ended_at IS NULL',
)
const updateEnded = db.query<void, { message_id: string; ended_at: number }>(
  'UPDATE game_night_posts SET ended_at = :ended_at WHERE message_id = :message_id',
)
const updateCancelled = db.query<void, { message_id: string; ended_at: number; by: string }>(
  `UPDATE game_night_posts SET ended_at = :ended_at, cancelled_by = :by
   WHERE message_id = :message_id AND ended_at IS NULL`,
)
const updateVoiceChannel = db.query<void, { message_id: string; voice_channel_id: string }>(
  'UPDATE game_night_posts SET voice_channel_id = :voice_channel_id WHERE message_id = :message_id',
)
const updateReminded = db.query<void, { message_id: string; at: number }>(
  'UPDATE game_night_posts SET reminded_at = :at WHERE message_id = :message_id',
)
const selectHistory = db.query<PostRow, { before: number; limit: number }>(
  `SELECT * FROM game_night_posts WHERE posted_at < :before
   ORDER BY posted_at DESC LIMIT :limit`,
)
const insertAttendee = db.query<void, { message_id: string; member_id: string }>(
  `INSERT OR IGNORE INTO game_night_attendees (message_id, member_id)
   VALUES (:message_id, :member_id)`,
)
const selectAttendees = db.query<{ member_id: string }, { message_id: string }>(
  'SELECT member_id FROM game_night_attendees WHERE message_id = :message_id',
)
const selectMemberStats = db.query<
  { attended: number; said_in: number; showed_up: number },
  { member_id: string; since: number }
>(
  `SELECT
     (SELECT COUNT(*) FROM game_night_attendees a
        JOIN game_night_posts p ON p.message_id = a.message_id
        WHERE a.member_id = :member_id AND p.posted_at >= :since) AS attended,
     (SELECT COUNT(*) FROM game_night_responses r
        JOIN game_night_posts p ON p.message_id = r.message_id
        WHERE r.member_id = :member_id AND r.response = 'in' AND p.ended_at IS NOT NULL
          AND p.cancelled_by IS NULL AND p.posted_at >= :since) AS said_in,
     (SELECT COUNT(*) FROM game_night_responses r
        JOIN game_night_posts p ON p.message_id = r.message_id
        JOIN game_night_attendees a ON a.message_id = r.message_id AND a.member_id = r.member_id
        WHERE r.member_id = :member_id AND r.response = 'in' AND p.posted_at >= :since) AS showed_up`,
)

const selectResponses = db.query<
  { member_id: string; display_name: string; response: GameNightResponse },
  { message_id: string }
>(
  `SELECT member_id, display_name, response FROM game_night_responses
   WHERE message_id = :message_id ORDER BY responded_at`,
)
const upsertResponse = db.query<
  void,
  {
    message_id: string
    member_id: string
    display_name: string
    response: GameNightResponse
    responded_at: number
  }
>(
  `INSERT INTO game_night_responses (message_id, member_id, display_name, response, responded_at)
   VALUES (:message_id, :member_id, :display_name, :response, :responded_at)
   ON CONFLICT (message_id, member_id) DO UPDATE SET
     display_name = excluded.display_name,
     response     = excluded.response,
     responded_at = excluded.responded_at`,
)
const deleteResponse = db.query<void, { message_id: string; member_id: string }>(
  'DELETE FROM game_night_responses WHERE message_id = :message_id AND member_id = :member_id',
)

/** Planned nights carry '' for "no voice channel yet"; the column predates them and can't be null. */
function toPost(row: PostRow): GameNightPost {
  return {
    messageId: row.message_id,
    channelId: row.channel_id,
    voiceChannelId: row.voice_channel_id || null,
    game: row.game,
    content: row.content,
    postedAt: row.posted_at,
    endedAt: row.ended_at,
    scheduledFor: row.scheduled_for,
    hostId: row.host_id,
    remindedAt: row.reminded_at,
    cancelledBy: row.cancelled_by,
  }
}

export function saveGameNightPost(post: {
  messageId: string
  channelId: string
  voiceChannelId: string | null
  game: string
  content: string
  postedAt: number
  scheduledFor?: number | null
  hostId?: string | null
  remindedAt?: number | null
}): void {
  insertPost.run({
    message_id: post.messageId,
    channel_id: post.channelId,
    voice_channel_id: post.voiceChannelId ?? '',
    game: post.game,
    content: post.content,
    posted_at: post.postedAt,
    scheduled_for: post.scheduledFor ?? null,
    host_id: post.hostId ?? null,
    reminded_at: post.remindedAt ?? null,
  })
}

export function getGameNightPost(messageId: string): GameNightPost | null {
  const row = selectPost.get({ message_id: messageId })
  return row ? toPost(row) : null
}

/** Game nights that haven't ended yet, planned ones included. */
export function listOpenGameNightPosts(): GameNightPost[] {
  return selectOpenPosts.all().map(toPost)
}

/** Ends a game night and records who came: everyone in its voice channel while it ran. */
export function endGameNightPost(messageId: string, at: number, attendees: string[] = []): void {
  db.transaction(() => {
    updateEnded.run({ message_id: messageId, ended_at: at })
    for (const memberId of attendees)
      insertAttendee.run({ message_id: messageId, member_id: memberId })
  })()
}

/** False if it had already ended. */
export function cancelGameNightPost(messageId: string, by: string, at: number): boolean {
  return updateCancelled.run({ message_id: messageId, ended_at: at, by }).changes > 0
}

export function setGameNightVoiceChannel(messageId: string, voiceChannelId: string): void {
  updateVoiceChannel.run({ message_id: messageId, voice_channel_id: voiceChannelId })
}

export function markGameNightReminded(messageId: string, at: number): void {
  updateReminded.run({ message_id: messageId, at })
}

export function listGameNightAttendees(messageId: string): string[] {
  return selectAttendees.all({ message_id: messageId }).map((row) => row.member_id)
}

/** Game nights newest first, posted before a moment, for the dashboard's history. */
export function listGameNightHistory(before: number, limit: number): GameNightPost[] {
  return selectHistory.all({ before, limit }).map(toPost)
}

export type MemberGameNights = {
  /** Game nights they were in voice for. */
  attended: number
  /** Finished ones they answered "I'm in" to. */
  saidIn: number
  /** Of those, how many they came to. */
  showedUp: number
}

/** A member's game nights posted since a moment. */
export function getMemberGameNights(memberId: string, since: number): MemberGameNights {
  const row = selectMemberStats.get({ member_id: memberId, since })
  return {
    attended: row?.attended ?? 0,
    saidIn: row?.said_in ?? 0,
    showedUp: row?.showed_up ?? 0,
  }
}

export function listGameNightResponses(
  messageId: string,
): { memberId: string; displayName: string; response: GameNightResponse }[] {
  return selectResponses.all({ message_id: messageId }).map((row) => ({
    memberId: row.member_id,
    displayName: row.display_name,
    response: row.response,
  }))
}

/**
 * Records a member's answer. Pressing the button they already chose takes it back, so a
 * misclick can be undone. Returns what they now have, or null for no answer.
 */
export function toggleGameNightResponse(input: {
  messageId: string
  memberId: string
  displayName: string
  response: GameNightResponse
  at: number
}): GameNightResponse | null {
  return db.transaction(() => {
    const current = listGameNightResponses(input.messageId).find(
      (row) => row.memberId === input.memberId,
    )
    if (current?.response === input.response) {
      deleteResponse.run({ message_id: input.messageId, member_id: input.memberId })
      return null
    }
    upsertResponse.run({
      message_id: input.messageId,
      member_id: input.memberId,
      display_name: input.displayName,
      response: input.response,
      responded_at: input.at,
    })
    return input.response
  })()
}
