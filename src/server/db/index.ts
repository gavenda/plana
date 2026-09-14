import { Database } from 'bun:sqlite'
import { dirname } from 'node:path'
import { mkdirSync } from 'node:fs'

import { env } from '../env'

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
    console.log(`[db] applied migration ${version + 1}`)
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
