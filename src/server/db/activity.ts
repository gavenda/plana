import { db } from './index'

/**
 * A gap shorter than this joins the rows either side of it, so a paused track, a game
 * restarted after a crash or a presence that blinks offline stays one session.
 */
const RESUME_WINDOW_MS = 5 * 60_000

/** Shorter game sessions are left out of the totals: launchers and quick looks, not play. */
export const MIN_GAME_SESSION_MS = 60_000

/** Spotify's own rule for what counts as a play. */
export const MIN_TRACK_PLAY_MS = 30_000

export type OpenRow = { id: number; startedAt: number }

export type Track = {
  id: string
  title: string
  artist: string | null
  album: string | null
  artUrl: string | null
}

// ---------------------------------------------------------------------------
// Games
// ---------------------------------------------------------------------------

const lastGameSession = db.query<
  { id: number; started_at: number },
  { member_id: string; game: string; after: number }
>(
  `SELECT id, started_at FROM game_sessions
   WHERE member_id = :member_id AND game = :game AND ended_at >= :after
   ORDER BY ended_at DESC LIMIT 1`,
)
const insertGameSession = db.query<
  { id: number },
  { member_id: string; game: string; now: number }
>(
  `INSERT INTO game_sessions (member_id, game, started_at, ended_at)
   VALUES (:member_id, :game, :now, :now) RETURNING id`,
)
const touchGameSession = db.query<void, { id: number; now: number }>(
  'UPDATE game_sessions SET ended_at = :now WHERE id = :id',
)

export function openGameSession(memberId: string, game: string, now: number): OpenRow {
  const recent = lastGameSession.get({ member_id: memberId, game, after: now - RESUME_WINDOW_MS })
  if (recent) {
    touchGameSession.run({ id: recent.id, now })
    return { id: recent.id, startedAt: recent.started_at }
  }
  const row = insertGameSession.get({ member_id: memberId, game, now })!
  return { id: row.id, startedAt: now }
}

// ---------------------------------------------------------------------------
// Spotify
// ---------------------------------------------------------------------------

/**
 * Only the member's latest play is resumed, and only if it is the same track, so pausing
 * keeps one play while going back to a song after another counts it again.
 */
const lastTrackPlay = db.query<
  { id: number; track_id: string; started_at: number; ended_at: number },
  { member_id: string }
>(
  `SELECT id, track_id, started_at, ended_at FROM spotify_plays
   WHERE member_id = :member_id ORDER BY ended_at DESC LIMIT 1`,
)
const insertTrackPlay = db.query<
  { id: number },
  {
    member_id: string
    track_id: string
    title: string
    artist: string | null
    album: string | null
    art_url: string | null
    now: number
  }
>(
  `INSERT INTO spotify_plays (member_id, track_id, title, artist, album, art_url, started_at, ended_at)
   VALUES (:member_id, :track_id, :title, :artist, :album, :art_url, :now, :now) RETURNING id`,
)
const touchTrackPlay = db.query<void, { id: number; now: number }>(
  'UPDATE spotify_plays SET ended_at = :now WHERE id = :id',
)

export function openTrackPlay(memberId: string, track: Track, now: number): OpenRow {
  const last = lastTrackPlay.get({ member_id: memberId })
  if (last && last.track_id === track.id && last.ended_at >= now - RESUME_WINDOW_MS) {
    touchTrackPlay.run({ id: last.id, now })
    return { id: last.id, startedAt: last.started_at }
  }
  const row = insertTrackPlay.get({
    member_id: memberId,
    track_id: track.id,
    title: track.title,
    artist: track.artist,
    album: track.album,
    art_url: track.artUrl,
    now,
  })!
  return { id: row.id, startedAt: now }
}

// ---------------------------------------------------------------------------
// Both
// ---------------------------------------------------------------------------

/**
 * Moves the end of open rows up to now. An open row's `ended_at` is always the last time
 * it was seen, so after a crash or restart it is already closed at about the right time.
 */
export const touchActivity = db.transaction(
  (rows: { games: number[]; tracks: number[] }, now: number) => {
    for (const id of rows.games) touchGameSession.run({ id, now })
    for (const id of rows.tracks) touchTrackPlay.run({ id, now })
  },
)

// ---------------------------------------------------------------------------
// Totals
// ---------------------------------------------------------------------------

export type GameTotal = { game: string; memberId: string; ms: number }

/** Time per game and member since a moment; a session that began earlier counts from it. */
const selectGameTotals = db.query<
  { game: string; member_id: string; ms: number },
  { since: number; min: number }
>(
  `SELECT game, member_id, SUM(ended_at - MAX(started_at, :since)) AS ms
   FROM game_sessions
   WHERE ended_at > :since AND ended_at - started_at >= :min
   GROUP BY game, member_id`,
)

export function listGameTotals(since: number): GameTotal[] {
  return selectGameTotals
    .all({ since, min: MIN_GAME_SESSION_MS })
    .map((row) => ({ game: row.game, memberId: row.member_id, ms: row.ms }))
}

const selectGamePlayerTotals = db.query<
  { member_id: string; ms: number },
  { game: string; since: number; min: number }
>(
  `SELECT member_id, SUM(ended_at - MAX(started_at, :since)) AS ms
   FROM game_sessions
   WHERE game = :game AND ended_at > :since AND ended_at - started_at >= :min
   GROUP BY member_id
   ORDER BY ms DESC`,
)

/** Time per member on one game since a moment, most first. */
export function listGamePlayerTotals(
  game: string,
  since: number,
): { memberId: string; ms: number }[] {
  return selectGamePlayerTotals
    .all({ game, since, min: MIN_GAME_SESSION_MS })
    .map((row) => ({ memberId: row.member_id, ms: row.ms }))
}

export type TrackTotal = Track & { memberId: string; plays: number; ms: number }

const selectTrackTotals = db.query<
  {
    track_id: string
    member_id: string
    title: string
    artist: string | null
    album: string | null
    art_url: string | null
    plays: number
    ms: number
  },
  { since: number; min: number }
>(
  `SELECT track_id, member_id,
     MAX(title) AS title, MAX(artist) AS artist, MAX(album) AS album, MAX(art_url) AS art_url,
     COUNT(*) AS plays,
     SUM(ended_at - MAX(started_at, :since)) AS ms
   FROM spotify_plays
   WHERE started_at >= :since AND ended_at - started_at >= :min
   GROUP BY track_id, member_id`,
)

export function listTrackTotals(since: number): TrackTotal[] {
  return selectTrackTotals.all({ since, min: MIN_TRACK_PLAY_MS }).map((row) => ({
    id: row.track_id,
    memberId: row.member_id,
    title: row.title,
    artist: row.artist,
    album: row.album,
    artUrl: row.art_url,
    plays: row.plays,
    ms: row.ms,
  }))
}
