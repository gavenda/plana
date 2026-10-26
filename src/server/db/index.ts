import { Database } from 'bun:sqlite'
import { dirname } from 'node:path'
import { mkdirSync } from 'node:fs'

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
]

function migrate(database: Database): void {
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

function open(): Database {
  if (env.DATABASE_PATH !== ':memory:') {
    mkdirSync(dirname(env.DATABASE_PATH), { recursive: true })
  }
  const database = new Database(env.DATABASE_PATH, { create: true, strict: true })
  database.run('PRAGMA journal_mode = WAL')
  database.run('PRAGMA foreign_keys = ON')
  database.run('PRAGMA busy_timeout = 5000')
  migrate(database)
  return database
}

export const db = open()
