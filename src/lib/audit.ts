import { absoluteTime } from './format'

export type AuditAction =
  | 'member.join'
  | 'role.assign'
  | 'broadcast.send'
  | 'settings.update'
  | 'birthday.announce'
  | 'birthday.set'
  | 'birthday.remove'
  | 'birthday.role'
  | 'triage.remind'
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

/** The audit log's filter groups, in chip order. The server maps each onto its actions. */
export const AUDIT_CATEGORIES = [
  { id: 'triage', label: 'Triage' },
  { id: 'moderation', label: 'Moderation' },
  { id: 'messages', label: 'Messages' },
  { id: 'birthdays', label: 'Birthdays' },
  { id: 'broadcasts', label: 'Broadcasts' },
  { id: 'settings', label: 'Settings' },
] as const

export type AuditCategory = (typeof AUDIT_CATEGORIES)[number]['id']

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
  /** Message text the entry kept, shown in full under the summary. */
  quotes?: AuditQuote[]
}

export type AuditQuote = { label: string; text: string }

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
  birthdayRoleId: { label: 'the birthday role', kind: 'role' },
  moderatorRoleId: { label: 'the moderator role', kind: 'role' },
}

/** Settings that hold a number of days rather than an ID. */
const DAY_SETTING_NAMES: Record<string, string> = {
  triageReminderDays: 'the triage reminder',
}

function settingChange(key: string, change: unknown): SummaryPart[] {
  const days = DAY_SETTING_NAMES[key]
  if (days) {
    const to = (change as { to?: unknown } | null)?.to
    return typeof to === 'number'
      ? [`set ${days} to ${to} ${to === 1 ? 'day' : 'days'}`]
      : [`turned off ${days}`]
  }

  const setting = SETTING_NAMES[key]
  if (!setting) return [key]
  const to = id((change as { to?: unknown } | null)?.to)
  if (!to) return [`cleared ${setting.label}`]
  return [
    `set ${setting.label} to `,
    setting.kind === 'role' ? { role: null, roleId: to } : { channel: null, channelId: to },
  ]
}

function names(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((name): name is string => typeof name === 'string')
    : []
}

/** ` (“reason”)` when a moderator gave one. */
function reason(detail: AuditEntry['detail']): string {
  const given = text(detail?.reason, '')
  return given ? ` (“${truncate(given)}”)` : ''
}

/** A deleted message's text, plus the names of any files it carried. */
function messageText(content: unknown, attachments: unknown): string {
  const files = names(attachments)
  const body = text(content, '')
  if (files.length === 0) return body || '(no text)'
  return [body, `Attachments: ${files.join(', ')}`].filter(Boolean).join('\n')
}

/** Moderation actions that read "<moderator> <verb> <member>". Undoing ones are neutral. */
const MODERATION: Record<string, { label: string; verb: string; undo?: boolean }> = {
  'moderation.ban': { label: 'Ban', verb: ' banned ' },
  'moderation.unban': { label: 'Unban', verb: ' unbanned ', undo: true },
  'moderation.kick': { label: 'Kick', verb: ' kicked ' },
  'moderation.untimeout': { label: 'Timeout', verb: ' lifted the timeout on ', undo: true },
  'moderation.mute': { label: 'Voice', verb: ' server-muted ' },
  'moderation.unmute': { label: 'Voice', verb: ' unmuted ', undo: true },
  'moderation.deafen': { label: 'Voice', verb: ' server-deafened ' },
  'moderation.undeafen': { label: 'Voice', verb: ' undeafened ', undo: true },
}

/** A voice channel kept on an entry, drawn like a channel mention. */
function voiceChannel(name: unknown, channelId: unknown): SummaryPart {
  return { channel: text(name, '') || null, channelId: id(channelId) }
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

    case 'triage.remind': {
      const names = Array.isArray(entry.detail?.memberNames)
        ? entry.detail.memberNames.filter((name): name is string => typeof name === 'string')
        : []
      return describe(
        'Reminder',
        'warn',
        'Reminded staff in ',
        targetChannel,
        ' that ',
        ...(names.length > 0 ? list(names.map((name) => [{ user: name }])) : ['members']),
        names.length === 1 ? ' is' : ' are',
        ' still waiting in triage',
      )
    }

    case 'birthday.role': {
      const role: SummaryPart = {
        role: id(entry.detail?.roleName),
        roleId: id(entry.detail?.roleId),
      }
      const added = names(entry.detail?.added).map((name): SummaryPart[] => [{ user: name }])
      const removed = names(entry.detail?.removed).map((name): SummaryPart[] => [{ user: name }])
      const parts: SummaryPart[] = []
      if (added.length > 0) parts.push('Gave ', ...list(added), ' the ', role, ' role')
      if (removed.length > 0) {
        if (added.length > 0) parts.push(', and took it back from ', ...list(removed))
        else parts.push('Took the ', role, ' role back from ', ...list(removed))
      }
      return describe('Birthday', 'success', ...parts)
    }

    case 'moderation.ban':
    case 'moderation.unban':
    case 'moderation.kick':
    case 'moderation.untimeout':
    case 'moderation.mute':
    case 'moderation.unmute':
    case 'moderation.deafen':
    case 'moderation.undeafen': {
      const kind = MODERATION[entry.action]!
      return describe(
        kind.label,
        kind.undo ? 'neutral' : 'warn',
        actor,
        kind.verb,
        target,
        reason(entry.detail),
      )
    }

    case 'moderation.move': {
      // The moved member is unknown when their channel change could not be matched up.
      const who = entry.targetName ? target : 'a member'
      const from = entry.detail?.fromChannelName
      return describe(
        'Voice',
        'neutral',
        actor,
        ' moved ',
        who,
        ...(from ? [' from ', voiceChannel(from, entry.detail?.fromChannelId)] : []),
        ' to ',
        voiceChannel(entry.detail?.channelName, entry.detail?.channelId),
      )
    }

    case 'moderation.disconnect': {
      const who = entry.targetName ? target : 'a member'
      const from = entry.detail?.channelName
      return describe(
        'Voice',
        'warn',
        actor,
        ' disconnected ',
        who,
        ...(from ? [' from ', voiceChannel(from, entry.detail?.channelId)] : []),
      )
    }

    case 'moderation.roles': {
      const roles = (value: unknown): SummaryPart[][] =>
        (Array.isArray(value) ? (value as { id?: unknown; name?: unknown }[]) : []).map((role) => [
          { role: id(role.name), roleId: id(role.id) },
        ])
      const added = roles(entry.detail?.added)
      const removed = roles(entry.detail?.removed)
      const parts: SummaryPart[] = [actor]
      if (added.length > 0) parts.push(' gave ', target, ' ', ...list(added))
      if (removed.length > 0) {
        parts.push(added.length > 0 ? ' and removed ' : ' removed ', ...list(removed), ' from ')
        if (added.length === 0) parts.push(target)
        else parts.push('them')
      }
      return describe('Roles', 'neutral', ...parts, reason(entry.detail))
    }

    case 'moderation.nickname': {
      const to = text(entry.detail?.to, '')
      return to
        ? describe('Nickname', 'neutral', actor, ' renamed ', target, ` to “${to}”`)
        : describe('Nickname', 'neutral', actor, ' cleared ', ...whose, ' nickname')
    }

    case 'moderation.timeout': {
      const until =
        typeof entry.detail?.until === 'number' ? absoluteTime(entry.detail.until) : null
      return describe(
        'Timeout',
        'warn',
        actor,
        ' timed out ',
        target,
        until ? ` until ${until}` : '',
        reason(entry.detail),
      )
    }

    case 'message.delete': {
      const channel: SummaryPart = {
        channel: text(entry.detail?.channelName, '').replace(/^#/, '') || null,
        channelId: id(entry.detail?.channelId),
      }
      return {
        ...describe(
          'Message deleted',
          'warn',
          'A message by ',
          target,
          ' was deleted in ',
          channel,
        ),
        quotes: [
          { label: 'Message', text: messageText(entry.detail?.content, entry.detail?.attachments) },
        ],
      }
    }

    case 'message.edit': {
      const channel: SummaryPart = {
        channel: text(entry.detail?.channelName, '').replace(/^#/, '') || null,
        channelId: id(entry.detail?.channelId),
      }
      return {
        ...describe('Message edited', 'neutral', actor, ' edited a message in ', channel),
        quotes: [
          { label: 'Before', text: text(entry.detail?.before, '(no text)') },
          { label: 'After', text: text(entry.detail?.after, '(no text)') },
        ],
      }
    }

    case 'message.bulk_delete': {
      const count = typeof entry.detail?.count === 'number' ? entry.detail.count : 0
      const kept = Array.isArray(entry.detail?.messages)
        ? (entry.detail.messages as Record<string, unknown>[])
        : []
      const transcript = kept
        .map(
          (message) =>
            `${text(message.authorName, 'Unknown')}: ${text(message.content, '(no text)')}`,
        )
        .join('\n')
      const unseen = count - kept.length
      return {
        ...describe(
          'Messages deleted',
          'warn',
          `${count} ${count === 1 ? 'message was' : 'messages were'} deleted at once in `,
          targetChannel,
        ),
        quotes: transcript
          ? [
              {
                label:
                  unseen > 0
                    ? `Messages (${unseen} not shown: from bots, or sent before Plana last started)`
                    : 'Messages',
                text: transcript,
              },
            ]
          : [],
      }
    }

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
    case 'birthday.role':
      return 'cake'
    case 'triage.remind':
      return 'hourglass_top'
    case 'moderation.ban':
    case 'moderation.unban':
    case 'moderation.kick':
    case 'moderation.timeout':
    case 'moderation.untimeout':
    case 'moderation.roles':
    case 'moderation.nickname':
      return 'gavel'
    case 'moderation.mute':
    case 'moderation.unmute':
    case 'moderation.deafen':
    case 'moderation.undeafen':
    case 'moderation.move':
    case 'moderation.disconnect':
      return 'headset_mic'
    case 'message.delete':
      return 'delete'
    case 'message.edit':
      return 'edit'
    case 'message.bulk_delete':
      return 'delete_sweep'
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
