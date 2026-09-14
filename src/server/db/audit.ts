import { db } from './index'

export type AuditAction = 'member.join' | 'role.assign' | 'broadcast.send' | 'settings.update'
export type AuditSource = 'discord' | 'dashboard' | 'system'

export type AuditEntry = {
  id: number
  createdAt: number
  action: AuditAction
  source: AuditSource
  actorId: string | null
  actorName: string | null
  targetId: string | null
  targetName: string | null
  detail: Record<string, unknown> | null
}

type AuditRow = {
  id: number
  created_at: number
  action: string
  source: string
  actor_id: string | null
  actor_name: string | null
  target_id: string | null
  target_name: string | null
  detail: string | null
}

export type RecordAuditInput = {
  action: AuditAction
  source: AuditSource
  actorId?: string | null
  actorName?: string | null
  targetId?: string | null
  targetName?: string | null
  detail?: Record<string, unknown> | null
}

const insert = db.query<{ id: number }, Omit<AuditRow, 'id'>>(
  `INSERT INTO audit_log
     (created_at, action, source, actor_id, actor_name, target_id, target_name, detail)
   VALUES
     (:created_at, :action, :source, :actor_id, :actor_name, :target_id, :target_name, :detail)
   RETURNING id`,
)
const selectPage = db.query<AuditRow, { limit: number; before: number }>(
  `SELECT * FROM audit_log WHERE id < :before ORDER BY id DESC LIMIT :limit`,
)
const countAll = db.query<{ total: number }, []>('SELECT COUNT(*) AS total FROM audit_log')

function toEntry(row: AuditRow): AuditEntry {
  return {
    id: row.id,
    createdAt: row.created_at,
    action: row.action as AuditAction,
    source: row.source as AuditSource,
    actorId: row.actor_id,
    actorName: row.actor_name,
    targetId: row.target_id,
    targetName: row.target_name,
    detail: row.detail ? (JSON.parse(row.detail) as Record<string, unknown>) : null,
  }
}

export function recordAudit(input: RecordAuditInput): number {
  const row = insert.get({
    created_at: Date.now(),
    action: input.action,
    source: input.source,
    actor_id: input.actorId ?? null,
    actor_name: input.actorName ?? null,
    target_id: input.targetId ?? null,
    target_name: input.targetName ?? null,
    detail: input.detail ? JSON.stringify(input.detail) : null,
  })
  return row!.id
}

/** Newest first. `before` is the `id` of the last entry from the previous page. */
export function listAudit(options: { limit?: number; before?: number } = {}): {
  entries: AuditEntry[]
  nextCursor: number | null
  total: number
} {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200)
  const before = options.before ?? Number.MAX_SAFE_INTEGER
  const rows = selectPage.all({ limit: limit + 1, before })

  const hasMore = rows.length > limit
  const entries = rows.slice(0, limit).map(toEntry)

  return {
    entries,
    nextCursor: hasMore ? (entries.at(-1)?.id ?? null) : null,
    total: countAll.get()!.total,
  }
}
