import { randomBytes } from 'node:crypto'

import { db } from './index'
import { env } from '../env'

export type SessionRow = {
  id: string
  user_id: string
  username: string
  display_name: string | null
  avatar: string | null
  created_at: number
  expires_at: number
}

export type SessionUser = {
  id: string
  username: string
  displayName: string
  avatar: string | null
}

const insert = db.query<void, SessionRow>(
  `INSERT INTO sessions (id, user_id, username, display_name, avatar, created_at, expires_at)
   VALUES (:id, :user_id, :username, :display_name, :avatar, :created_at, :expires_at)`,
)
const selectById = db.query<SessionRow, { id: string }>('SELECT * FROM sessions WHERE id = :id')
const deleteById = db.query<void, { id: string }>('DELETE FROM sessions WHERE id = :id')
const deleteExpired = db.query<void, { now: number }>(
  'DELETE FROM sessions WHERE expires_at <= :now',
)

export function createSession(user: SessionUser): { id: string; expiresAt: number } {
  const id = randomBytes(32).toString('base64url')
  const now = Date.now()
  const expiresAt = now + env.SESSION_TTL_DAYS * 86_400_000

  insert.run({
    id,
    user_id: user.id,
    username: user.username,
    display_name: user.displayName,
    avatar: user.avatar,
    created_at: now,
    expires_at: expiresAt,
  })

  return { id, expiresAt }
}

export function getSession(id: string): SessionUser | null {
  const row = selectById.get({ id })
  if (!row) return null
  if (row.expires_at <= Date.now()) {
    deleteById.run({ id })
    return null
  }
  return {
    id: row.user_id,
    username: row.username,
    displayName: row.display_name ?? row.username,
    avatar: row.avatar,
  }
}

export function destroySession(id: string): void {
  deleteById.run({ id })
}

export function pruneExpiredSessions(): number {
  return deleteExpired.run({ now: Date.now() }).changes
}
