import { publish } from '../live'
import { db } from './index'

export type AuditAction =
  | 'member.join'
  | 'role.assign'
  | 'broadcast.send'
  | 'settings.update'
  | 'backup.create'
  | 'birthday.announce'
  | 'birthday.set'
  | 'birthday.remove'
  | 'birthday.role'
  | 'triage.remind'
  | 'recap.post'
  | 'gamenight.announce'
  | 'gamenight.role'
  | 'moderation.ban'
  | 'moderation.unban'
  | 'moderation.kick'
  | 'moderation.timeout'
  | 'moderation.untimeout'
  | 'moderation.mute'
  | 'moderation.unmute'
  | 'moderation.deafen'
  | 'moderation.undeafen'
  | 'moderation.move'
  | 'moderation.disconnect'
  | 'moderation.roles'
  | 'moderation.nickname'
  | 'message.delete'
  | 'message.edit'
  | 'message.bulk_delete'
  | 'auth.login'
  | 'auth.denied'
  | 'auth.logout'
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
/**
 * The audit log's filter groups, as SQL LIKE patterns on `action`. Kept in step with
 * `AUDIT_CATEGORIES` in src/lib/audit.ts, which labels them in the dashboard.
 */
export const AUDIT_CATEGORY_ACTIONS = {
  triage: ['member.join', 'role.assign', 'triage.remind'],
  moderation: ['moderation.%'],
  messages: ['message.%'],
  birthdays: ['birthday.%'],
  broadcasts: ['broadcast.%', 'recap.%', 'gamenight.%'],
  settings: ['settings.%', 'backup.%'],
  access: ['auth.%'],
} as const satisfies Record<string, readonly string[]>

export type AuditCategory = keyof typeof AUDIT_CATEGORY_ACTIONS

export type AuditFilter = {
  /** Matched against who did it, who it was done to, and whatever the entry kept (message text, channel names, reasons). */
  search?: string
  /** Entries in any of these groups; all of them when empty. */
  categories?: AuditCategory[]
}

/** Escapes LIKE's wildcards, so a search for "100%" means exactly that. */
function likeLiteral(value: string): string {
  return `%${value.replace(/[\\%_]/g, (char) => `\\${char}`)}%`
}

/** The WHERE clause and its parameters for a filter. Every value is bound, never spliced. */
function whereFor(filter: AuditFilter): { sql: string; params: Record<string, string | number> } {
  const clauses: string[] = []
  const params: Record<string, string | number> = {}

  const patterns = (filter.categories ?? []).flatMap((category) => AUDIT_CATEGORY_ACTIONS[category])
  if (patterns.length > 0) {
    const names = patterns.map((pattern, index) => {
      params[`action${index}`] = pattern
      return `action LIKE :action${index}`
    })
    clauses.push(`(${names.join(' OR ')})`)
  }

  const search = filter.search?.trim()
  if (search) {
    params.search = likeLiteral(search)
    clauses.push(
      "(actor_name LIKE :search ESCAPE '\\' OR target_name LIKE :search ESCAPE '\\' " +
        "OR detail LIKE :search ESCAPE '\\')",
    )
  }

  return { sql: clauses.length > 0 ? clauses.join(' AND ') : '1', params }
}

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
  const createdAt = Date.now()
  const row = insert.get({
    created_at: createdAt,
    action: input.action,
    source: input.source,
    actor_id: input.actorId ?? null,
    actor_name: input.actorName ?? null,
    target_id: input.targetId ?? null,
    target_name: input.targetName ?? null,
    detail: input.detail ? JSON.stringify(input.detail) : null,
  })
  const id = row!.id

  // Open audit pages add it to the top; the Overview's recent activity too.
  publish('audit', {
    entry: {
      id,
      createdAt,
      action: input.action,
      source: input.source,
      actorId: input.actorId ?? null,
      actorName: input.actorName ?? null,
      targetId: input.targetId ?? null,
      targetName: input.targetName ?? null,
      detail: input.detail ?? null,
    } satisfies AuditEntry,
  })

  return id
}

/**
 * Newest first. `before` is the `id` of the last entry from the previous page; `after` asks
 * only for entries newer than one already shown. `total` counts the entries matching the
 * filter, across every page.
 */
export function listAudit(
  options: { limit?: number; before?: number; after?: number } & AuditFilter = {},
): {
  entries: AuditEntry[]
  nextCursor: number | null
  total: number
} {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200)
  const before = options.before ?? Number.MAX_SAFE_INTEGER
  const after = options.after ?? 0
  const where = whereFor(options)

  // bun:sqlite caches prepared statements by their SQL, and there are only a few shapes.
  const rows = db
    .query<AuditRow, Record<string, string | number>>(
      `SELECT * FROM audit_log WHERE id < :before AND id > :after AND ${where.sql} ORDER BY id DESC LIMIT :limit`,
    )
    .all({ ...where.params, before, after, limit: limit + 1 })
  const total = db
    .query<{ total: number }, Record<string, string | number>>(
      `SELECT COUNT(*) AS total FROM audit_log WHERE ${where.sql}`,
    )
    .get(where.params)!.total

  const hasMore = rows.length > limit
  const entries = rows.slice(0, limit).map(toEntry)

  return {
    entries,
    nextCursor: hasMore ? (entries.at(-1)?.id ?? null) : null,
    total,
  }
}

const selectMemberAudit = db.query<AuditRow, { member_id: string; limit: number }>(
  `SELECT * FROM audit_log WHERE target_id = :member_id OR actor_id = :member_id
   ORDER BY id DESC LIMIT :limit`,
)
const countMemberAudit = db.query<{ total: number }, { member_id: string }>(
  'SELECT COUNT(*) AS total FROM audit_log WHERE target_id = :member_id OR actor_id = :member_id',
)

/** The latest entries a member did or had done to them, newest first, and how many there are. */
export function listMemberAudit(
  memberId: string,
  limit: number,
): { entries: AuditEntry[]; total: number } {
  return {
    entries: selectMemberAudit.all({ member_id: memberId, limit }).map(toEntry),
    total: countMemberAudit.get({ member_id: memberId })!.total,
  }
}
