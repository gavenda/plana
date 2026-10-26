import { db } from './index'

const selectRole = db.query<{ role_id: string }, { game: string }>(
  'SELECT role_id FROM game_roles WHERE game = :game',
)
const upsertRole = db.query<void, { game: string; role_id: string }>(
  `INSERT INTO game_roles (game, role_id) VALUES (:game, :role_id)
   ON CONFLICT (game) DO UPDATE SET role_id = excluded.role_id`,
)
const deleteRole = db.query<void, { game: string }>('DELETE FROM game_roles WHERE game = :game')

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
  voiceChannelId: string
  game: string
  /** The announcement as first posted; responses are added below it on each edit. */
  content: string
  postedAt: number
}

type PostRow = {
  message_id: string
  channel_id: string
  voice_channel_id: string
  game: string
  content: string
  posted_at: number
}

const insertPost = db.query<void, PostRow>(
  `INSERT INTO game_night_posts (message_id, channel_id, voice_channel_id, game, content, posted_at)
   VALUES (:message_id, :channel_id, :voice_channel_id, :game, :content, :posted_at)`,
)
const selectPost = db.query<PostRow, { message_id: string }>(
  'SELECT * FROM game_night_posts WHERE message_id = :message_id',
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

export function saveGameNightPost(post: GameNightPost): void {
  insertPost.run({
    message_id: post.messageId,
    channel_id: post.channelId,
    voice_channel_id: post.voiceChannelId,
    game: post.game,
    content: post.content,
    posted_at: post.postedAt,
  })
}

export function getGameNightPost(messageId: string): GameNightPost | null {
  const row = selectPost.get({ message_id: messageId })
  return row
    ? {
        messageId: row.message_id,
        channelId: row.channel_id,
        voiceChannelId: row.voice_channel_id,
        game: row.game,
        content: row.content,
        postedAt: row.posted_at,
      }
    : null
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
