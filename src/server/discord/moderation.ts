import {
  AuditLogEvent,
  type ClientEvents,
  type Guild,
  type GuildAuditLogsEntry,
  type Message,
  type PartialMessage,
} from 'discord.js'

import { recordAudit, type AuditAction } from '../db/audit'
import { isConfiguredGuild } from '../utils/is-configured-guild'

/** Discord's own ceiling on a message, with Nitro. Anything longer is cut. */
const MAX_CONTENT = 4000

/** A bulk delete keeps this much of each message, so one entry stays a reasonable size. */
const MAX_BULK_CONTENT = 500

type AnyMessage = Message | PartialMessage

function clip(content: string, limit: number): string {
  return content.length <= limit ? content : `${content.slice(0, limit - 1)}…`
}

/**
 * Messages worth logging: from people, in this server. Partial messages were sent before the
 * bot's cache saw them, so their author and text are unknown and there is nothing to log.
 */
function loggable(message: AnyMessage): message is Message<true> {
  return (
    !message.partial &&
    message.inGuild() &&
    isConfiguredGuild(message.guildId) &&
    !message.author.bot &&
    !message.system
  )
}

function authorName(message: Message<true>): string {
  return message.member?.displayName ?? message.author.displayName
}

function channelName(message: Message<true>): string {
  return `#${message.channel.name}`
}

/**
 * Discord does not say who deleted a message, so the entry names only its author. Whoever
 * deleted it is the author themselves or a moderator.
 */
export function logMessageDelete(message: AnyMessage): void {
  if (!loggable(message)) return

  recordAudit({
    action: 'message.delete',
    source: 'discord',
    targetId: message.author.id,
    targetName: authorName(message),
    detail: {
      channelId: message.channelId,
      channelName: channelName(message),
      messageId: message.id,
      sentAt: message.createdTimestamp,
      content: clip(message.content, MAX_CONTENT),
      attachments: [...message.attachments.values()].map((attachment) => attachment.name),
    },
  })
}

/** Only changes to the text count; Discord also "edits" a message to add a link preview. */
export function logMessageEdit(before: AnyMessage, after: AnyMessage): void {
  if (before.partial || !loggable(after)) return
  if (before.content === after.content) return

  recordAudit({
    action: 'message.edit',
    source: 'discord',
    actorId: after.author.id,
    actorName: authorName(after),
    targetId: after.author.id,
    targetName: authorName(after),
    detail: {
      channelId: after.channelId,
      channelName: channelName(after),
      messageId: after.id,
      url: after.url,
      before: clip(before.content, MAX_CONTENT),
      after: clip(after.content, MAX_CONTENT),
    },
  })
}

export function logBulkDelete(...[messages, channel]: ClientEvents['messageDeleteBulk']): void {
  if (!isConfiguredGuild(channel.guildId)) return

  const known = [...messages.values()]
    .filter(loggable)
    .sort((a, b) => a.createdTimestamp - b.createdTimestamp)

  recordAudit({
    action: 'message.bulk_delete',
    source: 'discord',
    targetId: channel.id,
    targetName: `#${channel.name}`,
    detail: {
      count: messages.size,
      messages: known.map((message) => ({
        authorId: message.author.id,
        authorName: authorName(message),
        sentAt: message.createdTimestamp,
        content: clip(message.content, MAX_BULK_CONTENT),
      })),
    },
  })
}

async function nameOf(guild: Guild, userId: string | null): Promise<string | null> {
  if (!userId) return null
  const member = guild.members.cache.get(userId)
  if (member) return member.displayName
  const user = await guild.client.users.fetch(userId).catch(() => null)
  return user?.displayName ?? null
}

// ---------------------------------------------------------------------------
// Voice moves and disconnects
// ---------------------------------------------------------------------------

/**
 * Discord's audit log says who moved or disconnected someone, but not who was moved. The
 * gateway says who changed voice channel, but not who did it. Recent channel changes are kept
 * here briefly so the two can be matched up.
 */
type VoiceChange = {
  memberId: string
  fromId: string | null
  fromName: string | null
  toId: string | null
  toName: string | null
  at: number
  claimed: boolean
}

/** How far apart the voice change and its audit log entry may arrive. */
const VOICE_MATCH_WINDOW_MS = 10_000
const VOICE_MATCH_RETRY_MS = 500
const VOICE_MATCH_ATTEMPTS = 6

let voiceChanges: VoiceChange[] = []

export function rememberVoiceChange(...[before, after]: ClientEvents['voiceStateUpdate']): void {
  if (!isConfiguredGuild(after.guild.id)) return
  if (before.channelId === after.channelId) return

  const now = Date.now()
  voiceChanges = voiceChanges.filter((change) => now - change.at < VOICE_MATCH_WINDOW_MS)
  voiceChanges.push({
    memberId: after.id,
    fromId: before.channelId,
    fromName: before.channel?.name ?? null,
    toId: after.channelId,
    toName: after.channel?.name ?? null,
    at: now,
    claimed: false,
  })
}

/**
 * The latest unclaimed voice change that fits, waiting a few seconds for it if the audit log
 * entry arrived first. Claimed, so a second entry cannot pin the same change on someone else.
 */
async function claimVoiceChange(
  fits: (change: VoiceChange) => boolean,
): Promise<VoiceChange | null> {
  for (let attempt = 0; attempt < VOICE_MATCH_ATTEMPTS; attempt++) {
    const now = Date.now()
    const match = voiceChanges
      .filter(
        (change) => !change.claimed && now - change.at < VOICE_MATCH_WINDOW_MS && fits(change),
      )
      .at(-1)
    if (match) {
      match.claimed = true
      return match
    }
    await Bun.sleep(VOICE_MATCH_RETRY_MS)
  }
  return null
}

// ---------------------------------------------------------------------------
// Moderation actions from Discord's audit log
// ---------------------------------------------------------------------------

type ModerationRecord = {
  action: AuditAction
  /** Overrides the entry's own target, for moves and disconnects. */
  targetId?: string | null
  detail: Record<string, unknown>
}

type RoleRef = { id: string; name: string }

function roleRefs(value: unknown): RoleRef[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((role: { id?: unknown; name?: unknown }) =>
    typeof role.id === 'string' ? [{ id: role.id, name: String(role.name ?? '') }] : [],
  )
}

/** Each change in a member update that a moderator made, as its own record. */
function memberUpdateRecords(entry: GuildAuditLogsEntry): ModerationRecord[] {
  const records: ModerationRecord[] = []

  for (const change of entry.changes) {
    switch (change.key) {
      case 'communication_disabled_until': {
        const until = typeof change.new === 'string' ? Date.parse(change.new) : null
        records.push({
          action: until ? 'moderation.timeout' : 'moderation.untimeout',
          detail: { until },
        })
        break
      }
      case 'mute':
        records.push({ action: change.new ? 'moderation.mute' : 'moderation.unmute', detail: {} })
        break
      case 'deaf':
        records.push({
          action: change.new ? 'moderation.deafen' : 'moderation.undeafen',
          detail: {},
        })
        break
      case 'nick':
        // Members renaming themselves are not moderation.
        if (entry.executorId === entry.targetId) break
        records.push({
          action: 'moderation.nickname',
          detail: { from: change.old ?? null, to: change.new ?? null },
        })
        break
    }
  }
  return records
}

async function moderationRecords(
  entry: GuildAuditLogsEntry,
  guild: Guild,
): Promise<ModerationRecord[]> {
  switch (entry.action) {
    case AuditLogEvent.MemberBanAdd:
      return [{ action: 'moderation.ban', detail: {} }]
    case AuditLogEvent.MemberBanRemove:
      return [{ action: 'moderation.unban', detail: {} }]
    case AuditLogEvent.MemberKick:
      return [{ action: 'moderation.kick', detail: {} }]
    case AuditLogEvent.MemberUpdate:
      return memberUpdateRecords(entry)

    case AuditLogEvent.MemberRoleUpdate: {
      // Plana logs its own role changes, and other bots (reaction roles and the like) or
      // members picking their own roles are not moderation.
      if (entry.executorId === entry.targetId || entry.executorId === guild.client.user.id) {
        return []
      }
      const executor = entry.executorId
        ? await guild.client.users.fetch(entry.executorId).catch(() => null)
        : null
      if (executor?.bot) return []

      const added = roleRefs(entry.changes.find((change) => change.key === '$add')?.new)
      const removed = roleRefs(entry.changes.find((change) => change.key === '$remove')?.new)
      if (added.length === 0 && removed.length === 0) return []
      return [{ action: 'moderation.roles', detail: { added, removed } }]
    }

    case AuditLogEvent.MemberMove: {
      const extra = entry.extra as { channel: { id: string; name?: string } }
      const toId = extra.channel.id
      const moved = await claimVoiceChange(
        (change) => change.toId === toId && change.fromId != null,
      )
      return [
        {
          action: 'moderation.move',
          targetId: moved?.memberId ?? null,
          detail: {
            channelId: toId,
            channelName: moved?.toName ?? extra.channel.name ?? null,
            fromChannelId: moved?.fromId ?? null,
            fromChannelName: moved?.fromName ?? null,
          },
        },
      ]
    }

    case AuditLogEvent.MemberDisconnect: {
      const left = await claimVoiceChange((change) => change.toId == null)
      return [
        {
          action: 'moderation.disconnect',
          targetId: left?.memberId ?? null,
          detail: { channelId: left?.fromId ?? null, channelName: left?.fromName ?? null },
        },
      ]
    }

    default:
      return []
  }
}

/**
 * Bans, kicks, timeouts, voice moves and disconnects, server mutes and deafens, and role and
 * nickname changes, from Discord's own audit log: the only place that says who did them and
 * why. Needs the bot to hold the View Audit Log permission.
 *
 * Discord folds repeated voice moves and disconnects by one moderator within a few minutes
 * into a single entry without telling bots, so only the first of a quick run is recorded.
 */
export async function logModerationAction(entry: GuildAuditLogsEntry, guild: Guild): Promise<void> {
  if (!isConfiguredGuild(guild.id)) return

  const records = await moderationRecords(entry, guild)
  if (records.length === 0) return

  const actorName = await nameOf(guild, entry.executorId)

  for (const record of records) {
    const targetId = record.targetId !== undefined ? record.targetId : entry.targetId
    recordAudit({
      action: record.action,
      source: 'discord',
      actorId: entry.executorId,
      actorName,
      targetId,
      targetName: await nameOf(guild, targetId),
      detail: { ...record.detail, reason: entry.reason },
    })
  }
}
