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

/**
 * A piece of a summary: plain text, or a Discord role, channel or user to draw as a mention.
 * Roles and channels carry their id where the entry kept one, so their current name and colour
 * can be looked up; the stored name is the fallback for ones that have since gone.
 */
export type SummaryPart =
  | string
  | { role: string | null; roleId: string | null }
  | { channel: string | null; channelId: string | null }
  | { user: string }

export type AuditDescription = {
  label: string
  tone: 'accent' | 'success' | 'warn' | 'neutral'
  /** The summary in pieces, for drawing Discord names as mentions. */
  parts: SummaryPart[]
  /** The same summary as plain text, for tooltips and anywhere mentions can't be drawn. */
  summary: string
}

function text(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback
}

function id(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function truncate(value: string, limit = 90): string {
  const flat = value.replace(/\s+/g, ' ').trim()
  return flat.length <= limit ? flat : `${flat.slice(0, limit - 1)}…`
}

function partText(part: SummaryPart): string {
  if (typeof part === 'string') return part
  if ('user' in part) return `@${part.user}`
  if ('role' in part) return `@${part.role ?? 'role'}`
  return `#${part.channel ?? 'channel'}`
}

function describe(
  label: string,
  tone: AuditDescription['tone'],
  ...parts: SummaryPart[]
): AuditDescription {
  return { label, tone, parts, summary: parts.map(partText).join('') }
}

/** A member or administrator by name, or plain words when the entry has none. */
function user(name: string | null, fallback: string): SummaryPart {
  return name ? { user: name } : fallback
}

/** Puts a separator between groups of parts: "a, b and c". */
function list(groups: SummaryPart[][]): SummaryPart[] {
  return groups.flatMap((group, index) => {
    if (index === 0) return group
    return [index === groups.length - 1 ? ' and ' : ', ', ...group]
  })
}

/** What each setting is called in a summary, and whether it holds a role or a channel. */
const SETTING_NAMES: Record<string, { label: string; kind: 'role' | 'channel' }> = {
  triageRoleId: { label: 'the triage role', kind: 'role' },
  unitOwnerRoleId: { label: 'the Unit Owner role', kind: 'role' },
  boardersRoleId: { label: 'the Boarders role', kind: 'role' },
  announceChannelId: { label: 'the announcement channel', kind: 'channel' },
  birthdayChannelId: { label: 'the birthday channel', kind: 'channel' },
}

function settingChange(key: string, change: unknown): SummaryPart[] {
  const setting = SETTING_NAMES[key]
  if (!setting) return [key]
  const to = id((change as { to?: unknown } | null)?.to)
  if (!to) return [`cleared ${setting.label}`]
  return [
    `set ${setting.label} to `,
    setting.kind === 'role' ? { role: null, roleId: to } : { channel: null, channelId: to },
  ]
}

/** Turns a stored audit row into something a human can read at a glance. */
export function describeAudit(entry: AuditEntry): AuditDescription {
  const actor = user(entry.actorName, 'Someone')
  const target = user(entry.targetName, 'an unknown member')
  const self = entry.actorId != null && entry.actorId === entry.targetId
  /** "their" for someone acting on themselves, else the target's name with 's. */
  const whose: SummaryPart[] = self ? ['their'] : [target, "'s"]
  /** A channel as stored (`#general`), with its id when the entry kept it as the target. */
  const targetChannel: SummaryPart = {
    channel: entry.targetName ? entry.targetName.replace(/^#/, '') : null,
    channelId: entry.targetId,
  }

  switch (entry.action) {
    // Key kept as 'member.join' so existing rows keep rendering; what it records is
    // the member reaching triage, which is when the card is posted.
    case 'member.join':
      return describe('Triage', 'accent', target, ' entered triage')

    case 'role.assign':
      return describe('Role assigned', 'success', actor, ' gave ', target, ' ', {
        role: id(entry.detail?.roleName),
        roleId: id(entry.detail?.roleId),
      })

    case 'broadcast.send':
      return describe(
        'Broadcast',
        'accent',
        actor,
        ' posted to ',
        targetChannel,
        `: “${truncate(text(entry.detail?.content, ''))}”`,
      )

    case 'settings.update': {
      const changes = Object.entries(entry.detail ?? {}).map(([key, change]) =>
        settingChange(key, change),
      )
      return describe(
        'Settings',
        'warn',
        actor,
        ' ',
        ...(changes.length > 0 ? list(changes) : ['changed settings']),
      )
    }

    case 'birthday.announce': {
      const names = Array.isArray(entry.detail?.memberNames)
        ? entry.detail.memberNames.filter((name): name is string => typeof name === 'string')
        : []
      return describe(
        'Birthday',
        'success',
        'Wished ',
        ...(names.length > 0 ? list(names.map((name) => [{ user: name }])) : ['members']),
        ' a happy birthday in ',
        targetChannel,
      )
    }

    case 'birthday.set': {
      const from = text(entry.detail?.from, '')
      const to = text(entry.detail?.to, 'a date')
      return from
        ? describe(
            'Birthday',
            'neutral',
            actor,
            ' changed ',
            ...whose,
            ` birthday from ${from} to ${to}`,
          )
        : describe('Birthday', 'neutral', actor, ' set ', ...whose, ` birthday to ${to}`)
    }

    case 'birthday.remove':
      return describe('Birthday', 'neutral', actor, ' removed ', ...whose, ' birthday')

    default:
      return describe(entry.action, 'neutral', actor, ` performed ${entry.action}`)
  }
}

/** The leading icon for an entry's kind. Material Symbols; add new names to index.html. */
export function auditIcon(action: AuditAction): string {
  switch (action) {
    case 'member.join':
      return 'how_to_reg'
    case 'role.assign':
      return 'badge'
    case 'broadcast.send':
      return 'campaign'
    case 'settings.update':
      return 'settings'
    case 'birthday.announce':
    case 'birthday.set':
    case 'birthday.remove':
      return 'cake'
    default:
      return 'history'
  }
}

/** The tone as a container colour, for the leading icon in a list item. */
export function toneContainerClass(tone: AuditDescription['tone']): string {
  switch (tone) {
    case 'accent':
      return 'bg-primary-container text-on-primary-container'
    case 'success':
      return 'bg-success-container text-on-success-container'
    case 'warn':
      return 'bg-warning-container text-on-warning-container'
    default:
      return 'bg-surface-container-highest text-on-surface-variant'
  }
}
