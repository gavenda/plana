export type AuditAction =
  | 'member.join'
  | 'role.assign'
  | 'broadcast.send'
  | 'settings.update'
  | 'birthday.announce'
  | 'birthday.set'
  | 'birthday.remove'
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

export type AuditPage = {
  entries: AuditEntry[]
  nextCursor: number | null
  total: number
}

export type AuditDescription = {
  label: string
  tone: 'accent' | 'success' | 'warn' | 'neutral'
  summary: string
}

function text(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback
}

function truncate(value: string, limit = 90): string {
  const flat = value.replace(/\s+/g, ' ').trim()
  return flat.length <= limit ? flat : `${flat.slice(0, limit - 1)}…`
}

/** Turns a stored audit row into something a human can read at a glance. */
export function describeAudit(entry: AuditEntry): AuditDescription {
  const actor = text(entry.actorName, 'Someone')
  const target = text(entry.targetName, 'an unknown member')

  switch (entry.action) {
    // Key kept as 'member.join' so existing rows keep rendering; what it records is
    // the member reaching triage, which is when the card is posted.
    case 'member.join':
      return { label: 'Triage', tone: 'accent', summary: `${target} entered triage` }

    case 'role.assign':
      return {
        label: 'Role assigned',
        tone: 'success',
        summary: `${actor} gave ${target} the ${text(entry.detail?.roleName, 'configured')} role`,
      }

    case 'broadcast.send':
      return {
        label: 'Broadcast',
        tone: 'accent',
        summary: `${actor} posted to ${target}: “${truncate(text(entry.detail?.content, ''))}”`,
      }

    case 'settings.update':
      return {
        label: 'Settings',
        tone: 'warn',
        summary: `${actor} changed ${Object.keys(entry.detail ?? {}).join(', ') || 'settings'}`,
      }

    case 'birthday.announce': {
      const names = Array.isArray(entry.detail?.memberNames) ? entry.detail.memberNames : []
      return {
        label: 'Birthday',
        tone: 'success',
        summary: `Wished ${names.join(', ') || 'members'} a happy birthday in ${target}`,
      }
    }

    case 'birthday.set': {
      const from = text(entry.detail?.from, '')
      const to = text(entry.detail?.to, 'a date')
      const self = entry.actorId != null && entry.actorId === entry.targetId
      const whose = self ? 'their' : `${target}'s`
      return {
        label: 'Birthday',
        tone: 'neutral',
        summary: from
          ? `${actor} changed ${whose} birthday from ${from} to ${to}`
          : `${actor} set ${whose} birthday to ${to}`,
      }
    }

    case 'birthday.remove': {
      const self = entry.actorId != null && entry.actorId === entry.targetId
      return {
        label: 'Birthday',
        tone: 'neutral',
        summary: `${actor} removed ${self ? 'their' : `${target}'s`} birthday`,
      }
    }

    default:
      return { label: entry.action, tone: 'neutral', summary: `${actor} performed ${entry.action}` }
  }
}

export function toneClass(tone: AuditDescription['tone']): string {
  return tone === 'neutral' ? 'badge' : `badge badge-${tone}`
}
