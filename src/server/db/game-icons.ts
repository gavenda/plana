import { db } from './index'

export type GameIconSource = 'discord' | 'steam'

/** A lookup's outcome; `iconUrl` is null when no source knew the game. */
export type GameIcon = {
  game: string
  iconUrl: string | null
  source: GameIconSource | null
  applicationId: string | null
  checkedAt: number
}

type Row = {
  game: string
  icon_url: string | null
  source: GameIconSource | null
  application_id: string | null
  checked_at: number
}

const selectOne = db.query<Row, { game: string }>('SELECT * FROM game_icons WHERE game = :game')
const upsert = db.query<
  void,
  {
    game: string
    icon_url: string | null
    source: GameIconSource | null
    application_id: string | null
    checked_at: number
  }
>(
  `INSERT INTO game_icons (game, icon_url, source, application_id, checked_at)
   VALUES (:game, :icon_url, :source, :application_id, :checked_at)
   ON CONFLICT (game) DO UPDATE SET
     icon_url       = excluded.icon_url,
     source         = excluded.source,
     application_id = excluded.application_id,
     checked_at     = excluded.checked_at`,
)

export function getGameIcon(game: string): GameIcon | null {
  const row = selectOne.get({ game })
  return row
    ? {
        game: row.game,
        iconUrl: row.icon_url,
        source: row.source,
        applicationId: row.application_id,
        checkedAt: row.checked_at,
      }
    : null
}

export function saveGameIcon(icon: GameIcon): void {
  upsert.run({
    game: icon.game,
    icon_url: icon.iconUrl,
    source: icon.source,
    application_id: icon.applicationId,
    checked_at: icon.checkedAt,
  })
}

/** A game's icon as one of the bot's application emojis. */
export type GameEmoji = { game: string; emojiId: string; name: string; iconUrl: string }

const selectEmoji = db.query<
  { game: string; emoji_id: string; name: string; icon_url: string },
  { game: string }
>('SELECT * FROM game_emojis WHERE game = :game')
const upsertEmoji = db.query<
  void,
  { game: string; emoji_id: string; name: string; icon_url: string }
>(
  `INSERT INTO game_emojis (game, emoji_id, name, icon_url)
   VALUES (:game, :emoji_id, :name, :icon_url)
   ON CONFLICT (game) DO UPDATE SET
     emoji_id = excluded.emoji_id,
     name     = excluded.name,
     icon_url = excluded.icon_url`,
)
const deleteEmoji = db.query<void, { game: string }>('DELETE FROM game_emojis WHERE game = :game')

export function getGameEmoji(game: string): GameEmoji | null {
  const row = selectEmoji.get({ game })
  return row
    ? { game: row.game, emojiId: row.emoji_id, name: row.name, iconUrl: row.icon_url }
    : null
}

export function saveGameEmoji(emoji: GameEmoji): void {
  upsertEmoji.run({
    game: emoji.game,
    emoji_id: emoji.emojiId,
    name: emoji.name,
    icon_url: emoji.iconUrl,
  })
}

export function forgetGameEmoji(game: string): void {
  deleteEmoji.run({ game })
}
