import { Database } from 'bun:sqlite'
import { dirname } from 'node:path'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync } from 'node:fs'

import { env } from '../env'
import { logger } from '../logging'

const log = logger('db')

/**
 * Ordered, append-only. Each entry moves `PRAGMA user_version` forward by one,
 * so a migration is applied exactly once regardless of how often the bot restarts.
 */
const migrations: string[] = [
  `
  CREATE TABLE settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE sessions (
    id           TEXT PRIMARY KEY,
    user_id      TEXT NOT NULL,
    username     TEXT NOT NULL,
    display_name TEXT,
    avatar       TEXT,
    created_at   INTEGER NOT NULL,
    expires_at   INTEGER NOT NULL
  );
  CREATE INDEX sessions_expires_at ON sessions (expires_at);
  CREATE INDEX sessions_user_id    ON sessions (user_id);

  CREATE TABLE join_announcements (
    member_id   TEXT PRIMARY KEY,
    channel_id  TEXT NOT NULL,
    message_id  TEXT NOT NULL,
    created_at  INTEGER NOT NULL,
    resolved_at INTEGER
  );

  CREATE TABLE audit_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at  INTEGER NOT NULL,
    action      TEXT NOT NULL,
    source      TEXT NOT NULL,
    actor_id    TEXT,
    actor_name  TEXT,
    target_id   TEXT,
    target_name TEXT,
    detail      TEXT
  );
  CREATE INDEX audit_log_created_at ON audit_log (created_at DESC);
  `,
  `
  CREATE TABLE birthdays (
    member_id           TEXT PRIMARY KEY,
    month               INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
    day                 INTEGER NOT NULL CHECK (day BETWEEN 1 AND 31),
    created_at          INTEGER NOT NULL,
    updated_at          INTEGER NOT NULL,
    last_announced_year INTEGER
  );
  CREATE INDEX birthdays_month_day ON birthdays (month, day);
  `,
  `
  ALTER TABLE join_announcements ADD COLUMN reminded_at INTEGER;
  `,
  `
  CREATE TABLE game_sessions (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id  TEXT NOT NULL,
    game       TEXT NOT NULL,
    started_at INTEGER NOT NULL,
    ended_at   INTEGER NOT NULL
  );
  CREATE INDEX game_sessions_member   ON game_sessions (member_id, game, ended_at DESC);
  CREATE INDEX game_sessions_ended_at ON game_sessions (ended_at);

  CREATE TABLE spotify_plays (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id  TEXT NOT NULL,
    track_id   TEXT NOT NULL,
    title      TEXT NOT NULL,
    artist     TEXT,
    album      TEXT,
    art_url    TEXT,
    started_at INTEGER NOT NULL,
    ended_at   INTEGER NOT NULL
  );
  CREATE INDEX spotify_plays_member   ON spotify_plays (member_id, ended_at DESC);
  CREATE INDEX spotify_plays_ended_at ON spotify_plays (ended_at);
  `,
  `
  CREATE TABLE game_icons (
    game           TEXT PRIMARY KEY,
    icon_url       TEXT,
    source         TEXT,
    application_id TEXT,
    checked_at     INTEGER NOT NULL
  );
  `,
  `
  CREATE TABLE voice_sessions (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id    TEXT NOT NULL,
    channel_id   TEXT NOT NULL,
    channel_name TEXT NOT NULL,
    started_at   INTEGER NOT NULL,
    ended_at     INTEGER NOT NULL
  );
  CREATE INDEX voice_sessions_member   ON voice_sessions (member_id, ended_at DESC);
  CREATE INDEX voice_sessions_ended_at ON voice_sessions (ended_at);
  `,
  // Session IDs are now stored hashed. Rows from before hold raw IDs that no cookie hashes
  // to, so they are dropped: everyone signs in once more.
  `
  DELETE FROM sessions;
  `,
  // A member's page lists what they did and what was done to them.
  `
  CREATE INDEX audit_log_target_id ON audit_log (target_id);
  CREATE INDEX audit_log_actor_id  ON audit_log (actor_id);
  `,
  // One row per weekly recap posted, so a restart never posts the same week twice.
  `
  CREATE TABLE recaps (
    week       TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL,
    message_id TEXT NOT NULL,
    posted_at  INTEGER NOT NULL
  );
  `,
  // Game nights: the role pinged for each game, and when each game was last announced in
  // each voice channel, so a restart doesn't announce the same night twice.
  `
  CREATE TABLE game_roles (
    game    TEXT PRIMARY KEY,
    role_id TEXT NOT NULL
  );

  CREATE TABLE game_nights (
    channel_id   TEXT NOT NULL,
    game         TEXT NOT NULL,
    announced_at INTEGER NOT NULL,
    PRIMARY KEY (channel_id, game)
  );

  CREATE TABLE game_night_posts (
    message_id       TEXT PRIMARY KEY,
    channel_id       TEXT NOT NULL,
    voice_channel_id TEXT NOT NULL,
    game             TEXT NOT NULL,
    content          TEXT NOT NULL,
    posted_at        INTEGER NOT NULL
  );

  CREATE TABLE game_night_responses (
    message_id   TEXT NOT NULL REFERENCES game_night_posts (message_id) ON DELETE CASCADE,
    member_id    TEXT NOT NULL,
    display_name TEXT NOT NULL,
    response     TEXT NOT NULL CHECK (response IN ('in', 'out')),
    responded_at INTEGER NOT NULL,
    PRIMARY KEY (message_id, member_id)
  );

  -- Each game's icon uploaded as one of the bot's own emojis, and the icon it was made from.
  CREATE TABLE game_emojis (
    game     TEXT PRIMARY KEY,
    emoji_id TEXT NOT NULL,
    name     TEXT NOT NULL,
    icon_url TEXT NOT NULL
  );
  `,
  // Track totals, and a track's listeners, filter on when a play started. Without these they
  // read every play ever recorded, however short the window.
  `
  CREATE INDEX spotify_plays_started_at ON spotify_plays (started_at);
  CREATE INDEX spotify_plays_track      ON spotify_plays (track_id, started_at);
  `,
  // All-time plays and time per track and member, so all-time views don't read every play.
  // The trigger keeps it current as plays run on. 30000 is MIN_TRACK_PLAY_MS in
  // db/activity.ts: a play counts once it reaches it. Deleting plays leaves the totals alone.
  `
  CREATE TABLE spotify_track_totals (
    track_id  TEXT NOT NULL,
    member_id TEXT NOT NULL,
    title     TEXT NOT NULL,
    artist    TEXT,
    album     TEXT,
    art_url   TEXT,
    plays     INTEGER NOT NULL,
    ms        INTEGER NOT NULL,
    PRIMARY KEY (track_id, member_id)
  ) WITHOUT ROWID;
  CREATE INDEX spotify_track_totals_member ON spotify_track_totals (member_id);

  INSERT INTO spotify_track_totals (track_id, member_id, title, artist, album, art_url, plays, ms)
  SELECT track_id, member_id, MAX(title), MAX(artist), MAX(album), MAX(art_url),
    COUNT(*), SUM(ended_at - started_at)
  FROM spotify_plays
  WHERE ended_at - started_at >= 30000
  GROUP BY track_id, member_id;

  CREATE TRIGGER spotify_plays_totals AFTER UPDATE OF ended_at ON spotify_plays
  WHEN NEW.ended_at - NEW.started_at >= 30000
  BEGIN
    INSERT INTO spotify_track_totals (track_id, member_id, title, artist, album, art_url, plays, ms)
    VALUES (NEW.track_id, NEW.member_id, NEW.title, NEW.artist, NEW.album, NEW.art_url,
      1, NEW.ended_at - NEW.started_at)
    ON CONFLICT (track_id, member_id) DO UPDATE SET
      title   = excluded.title,
      artist  = excluded.artist,
      album   = excluded.album,
      art_url = excluded.art_url,
      plays   = plays + (OLD.ended_at - OLD.started_at < 30000),
      ms      = ms + (NEW.ended_at - NEW.started_at)
                   - (CASE WHEN OLD.ended_at - OLD.started_at >= 30000
                           THEN OLD.ended_at - OLD.started_at ELSE 0 END);
  END;
  `,
  // A game night ends once its players leave voice. Posts from before this was tracked are
  // closed unless recent, so the first check doesn't edit days-old announcements.
  `
  ALTER TABLE game_night_posts ADD COLUMN ended_at INTEGER;
  UPDATE game_night_posts SET ended_at = posted_at
  WHERE posted_at < unixepoch('now', '-12 hours') * 1000;
  `,
  // Game nights planned ahead with /gamenight plan, who came to each, and /remind. A planned
  // night's voice channel is '' until people gather for it.
  `
  ALTER TABLE game_night_posts ADD COLUMN scheduled_for INTEGER;
  ALTER TABLE game_night_posts ADD COLUMN host_id TEXT;
  ALTER TABLE game_night_posts ADD COLUMN reminded_at INTEGER;
  ALTER TABLE game_night_posts ADD COLUMN cancelled_by TEXT;
  CREATE INDEX game_night_posts_posted_at ON game_night_posts (posted_at DESC);
  CREATE INDEX game_night_responses_member ON game_night_responses (member_id);

  CREATE TABLE game_night_attendees (
    message_id TEXT NOT NULL REFERENCES game_night_posts (message_id) ON DELETE CASCADE,
    member_id  TEXT NOT NULL,
    PRIMARY KEY (message_id, member_id)
  ) WITHOUT ROWID;
  CREATE INDEX game_night_attendees_member ON game_night_attendees (member_id);

  CREATE TABLE reminders (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id  TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    text       TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    due_at     INTEGER NOT NULL
  );
  CREATE INDEX reminders_due_at ON reminders (due_at);
  CREATE INDEX reminders_member ON reminders (member_id, due_at);
  `,
]

/** The schema this version of Plana expects; a backup from a newer one can't be restored. */
export const SCHEMA_VERSION = migrations.length

/** Brings a database up to this version's schema; also run on a backup before it's restored. */
export function migrate(database: Database): void {
  const current = (database.query('PRAGMA user_version').get() as { user_version: number })
    .user_version

  for (let version = current; version < migrations.length; version++) {
    database.transaction(() => {
      database.run(migrations[version]!)
      // PRAGMA does not accept bound parameters.
      database.run(`PRAGMA user_version = ${version + 1}`)
    })()
    log.info`applied migration ${version + 1}`
  }
}

/** A backup staged by the dashboard's Restore, swapped in when the bot next starts. */
export const restorePaths = (path: string) => ({
  staged: `${path}.restore`,
  note: `${path}.restore.json`,
  previous: `${path}.pre-restore`,
})

export type RestoreNote = {
  key: string
  /** The backup of the database as it was, taken just before. */
  safetyKey: string
  actorId: string
  actorName: string
}

/** What was restored as this process started, for the audit log; null on a normal start. */
export let restoredFrom: RestoreNote | null = null

/**
 * Puts a staged backup in place of the database before it opens. The old file is kept beside
 * it as `.pre-restore`. Its `-wal` and `-shm` go too: left behind, SQLite would apply the old
 * database's log to the restored one.
 */
function swapInRestore(path: string): void {
  const { staged, note, previous } = restorePaths(path)
  if (!existsSync(staged)) return

  for (const suffix of ['', '-wal', '-shm']) {
    rmSync(`${previous}${suffix}`, { force: true })
    if (existsSync(`${path}${suffix}`)) renameSync(`${path}${suffix}`, `${previous}${suffix}`)
  }
  renameSync(staged, path)

  try {
    restoredFrom = JSON.parse(readFileSync(note, 'utf8')) as RestoreNote
  } catch {
    restoredFrom = null
  }
  rmSync(note, { force: true })
  log.warning`restored the database from ${restoredFrom?.key ?? 'a staged backup'}; the old one is at ${previous}`
}

function open(): Database {
  if (env.DATABASE_PATH !== ':memory:') {
    mkdirSync(dirname(env.DATABASE_PATH), { recursive: true })
    swapInRestore(env.DATABASE_PATH)
  }
  const database = new Database(env.DATABASE_PATH, { create: true, strict: true })
  database.run('PRAGMA journal_mode = WAL')
  database.run('PRAGMA foreign_keys = ON')
  database.run('PRAGMA busy_timeout = 5000')
  migrate(database)
  return database
}

export const db = open()
