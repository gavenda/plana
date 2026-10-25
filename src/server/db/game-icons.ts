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
