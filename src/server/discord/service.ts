import {
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  type GuildMember,
  type Role,
} from 'discord.js'

import { getGuild } from './client'
import { cached, CacheKey, CacheTtl, invalidate } from '../cache'
import { buildResolvedAnnouncement, buildTriageAnnouncement } from './components'
import { getAnnouncement, rememberAnnouncement, resolveAnnouncement } from '../db/announcements'
import { recordAudit } from '../db/audit'
import { DEFAULT_LOCALE, t } from '../i18n'
import { getSettings, type GuildSettings } from '../db/settings'

export type Actor = { id: string; name: string }
export type ActionSource = 'discord' | 'dashboard'

export type ErrorCode =
  | 'not_configured'
  | 'unknown_member'
  | 'unknown_role'
  | 'role_not_assignable'
  | 'unknown_channel'
  | 'channel_not_sendable'
  | 'missing_permissions'
  | 'discord_error'

export type Failure = {
  ok: false
  code: ErrorCode
  /** Translation key, so Discord can render this in the caller's own locale. */
  key: string
  params?: Record<string, unknown>
  /** Rendered in the default locale, for the dashboard API and the logs. */
  message: string
}

export type Result<T> = { ok: true; data: T } | Failure

const ok = <T>(data: T): Result<T> => ({ ok: true, data })

const err = (code: ErrorCode, key: string, params?: Record<string, unknown>): Failure => ({
  ok: false,
  code,
  key,
  params,
  message: t(key, { lng: DEFAULT_LOCALE, ...params }),
})

const TEXT_CHANNEL_TYPES = [ChannelType.GuildText, ChannelType.GuildAnnouncement] as const

function reason(actor: Actor, source: ActionSource): string {
  return `Plana — ${actor.name} (${actor.id}) via ${source}`
}

/** The two roles the join announcement offers, in button order. */
export async function getAssignableRoles(settings: GuildSettings = getSettings()): Promise<Role[]> {
  const guild = await getGuild()
  const ids = [settings.unitOwnerRoleId, settings.boardersRoleId].filter(
    (id): id is string => id != null,
  )

  const roles: Role[] = []
  for (const id of ids) {
    const role = guild.roles.cache.get(id) ?? (await guild.roles.fetch(id).catch(() => null))
    if (role) roles.push(role)
  }
  return roles
}

export async function isGuildAdmin(userId: string): Promise<boolean> {
  const guild = await getGuild()
  const member = await guild.members.fetch(userId).catch(() => null)
  return member?.permissions.has(PermissionFlagsBits.Administrator) ?? false
}

// ---------------------------------------------------------------------------
// Join announcements
// ---------------------------------------------------------------------------

/** Puts a new member into triage and posts the announcement card. */
/**
 * Announces a member entering triage. Driven by the triage role appearing rather than by
 * the join itself: Discord assigns that role through onboarding or an auto-role, which
 * can be well after the member arrived, and announcing on join would post a card for
 * someone who has not reached triage yet.
 *
 * Idempotent. An unresolved card already means this member is announced and waiting, so
 * the two events that can both fire for one arrival cannot produce two cards.
 */
export async function announceTriage(member: GuildMember): Promise<Result<{ messageId: string }>> {
  const settings = getSettings()

  const existing = getAnnouncement(member.id)
  if (existing && existing.resolvedAt == null) {
    return ok({ messageId: existing.messageId })
  }

  if (!settings.announceChannelId) {
    return err('not_configured', 'error.no_announce_channel')
  }

  const guild = member.guild
  const channel =
    guild.channels.cache.get(settings.announceChannelId) ??
    (await guild.channels.fetch(settings.announceChannelId).catch(() => null))

  if (!channel?.isTextBased()) {
    return err('unknown_channel', 'error.announce_channel_missing')
  }

  const roles = await getAssignableRoles(settings)
  const container = buildTriageAnnouncement(member, roles, guild.preferredLocale)

  try {
    const message = await channel.send({
      components: [container],
      flags: MessageFlags.IsComponentsV2,
    })
    rememberAnnouncement({ memberId: member.id, channelId: channel.id, messageId: message.id })
    recordAudit({
      action: 'member.join',
      source: 'discord',
      targetId: member.id,
      targetName: member.user.tag,
      detail: { channelId: channel.id, messageId: message.id },
    })
    return ok({ messageId: message.id })
  } catch (error) {
    console.error(`[join] failed to announce ${member.id}:`, error)
    return err('discord_error', 'error.announce_failed')
  }
}

/**
 * Announces a member only once they actually hold the triage role. Both the join and
 * the member-update event funnel through here, so neither needs to know the rule.
 */
export async function announceIfInTriage(member: GuildMember): Promise<void> {
  const { triageRoleId } = getSettings()
  if (!triageRoleId || !member.roles.cache.has(triageRoleId)) return

  const result = await announceTriage(member)
  if (!result.ok) console.warn(`[triage] ${member.user.tag}: ${result.message}`)
}

/**
 * Rewrites a stored announcement into its resolved state. Best effort: an
 * announcement that was deleted or predates the database must not fail the assignment.
 */
async function markAnnouncementResolved(options: {
  member: GuildMember
  roleName: string
  actor: Actor
  source: ActionSource
}): Promise<void> {
  const { member, roleName, actor, source } = options
  const record = getAnnouncement(member.id)
  if (!record || record.resolvedAt != null) return

  try {
    const channel =
      member.guild.channels.cache.get(record.channelId) ??
      (await member.guild.channels.fetch(record.channelId))
    if (!channel?.isTextBased()) return

    const message = await channel.messages.fetch(record.messageId)
    await message.edit({
      components: [
        buildResolvedAnnouncement({
          member,
          roleName,
          actorName: actor.name,
          source,
          locale: member.guild.preferredLocale,
        }),
      ],
      flags: MessageFlags.IsComponentsV2,
    })
  } catch (error) {
    console.warn(`[assign] could not update announcement for ${member.id}:`, error)
  } finally {
    resolveAnnouncement(member.id)
  }
}

// ---------------------------------------------------------------------------
// Role assignment
// ---------------------------------------------------------------------------

export type AssignedMember = {
  memberId: string
  memberName: string
  roleId: string
  roleName: string
}

export async function assignRole(input: {
  memberId: string
  roleId: string
  actor: Actor
  source: ActionSource
}): Promise<Result<AssignedMember>> {
  const { memberId, roleId, actor, source } = input
  const settings = getSettings()

  const allowed = [settings.unitOwnerRoleId, settings.boardersRoleId].filter(Boolean)
  if (!allowed.includes(roleId)) {
    return err('role_not_assignable', 'error.role_not_assignable')
  }

  const guild = await getGuild()
  const member = await guild.members.fetch(memberId).catch(() => null)
  if (!member) return err('unknown_member', 'error.unknown_member')

  const role = guild.roles.cache.get(roleId) ?? (await guild.roles.fetch(roleId).catch(() => null))
  if (!role) return err('unknown_role', 'error.unknown_role')

  const me = guild.members.me ?? (await guild.members.fetchMe())
  if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) {
    return err('missing_permissions', 'error.missing_manage_roles')
  }
  if (role.position >= me.roles.highest.position) {
    return err('missing_permissions', 'error.role_above_bot', { role: role.name })
  }

  try {
    await member.roles.add(role, reason(actor, source))

    if (settings.triageRoleId && member.roles.cache.has(settings.triageRoleId)) {
      await member.roles.remove(settings.triageRoleId, reason(actor, source))
    }
  } catch (error) {
    console.error(`[assign] failed for ${memberId} -> ${roleId}:`, error)
    return err('discord_error', 'error.assign_rejected')
  }

  recordAudit({
    action: 'role.assign',
    source,
    actorId: actor.id,
    actorName: actor.name,
    targetId: member.id,
    targetName: member.user.tag,
    detail: { roleId: role.id, roleName: role.name },
  })

  await markAnnouncementResolved({ member, roleName: role.name, actor, source })
  await invalidate(CacheKey.pendingMembers)

  return ok({
    memberId: member.id,
    memberName: member.user.tag,
    roleId: role.id,
    roleName: role.name,
  })
}

// ---------------------------------------------------------------------------
// Queue + directory
// ---------------------------------------------------------------------------

export type PendingMember = {
  id: string
  username: string
  displayName: string
  avatarUrl: string
  joinedAt: number | null
  createdAt: number
}

let membersPrimed = false
let priming: Promise<void> | null = null

/**
 * Past the gateway's large-guild threshold Discord sends only a subset of members in
 * GUILD_CREATE, so the full list must be requested once over the gateway — that
 * request is opcode 8, Request Guild Members. Afterwards GUILD_MEMBER_ADD / UPDATE /
 * REMOVE keep discord.js's cache accurate on their own.
 *
 * Running this per request is what gets a bot rate limited on opcode 8, so it happens
 * once at startup and then only on the slow refresh. Concurrent callers share one
 * in-flight fetch rather than each sending their own.
 */
export async function primeMemberCache(force = false): Promise<void> {
  if (membersPrimed && !force) return
  if (priming) return priming

  priming = (async () => {
    const guild = await getGuild()
    await guild.members.fetch()
    membersPrimed = true
    console.log(`[discord] member cache primed (${guild.members.cache.size} members)`)
  })().finally(() => {
    priming = null
  })

  return priming
}

export async function listPendingMembers(): Promise<Result<PendingMember[]>> {
  const settings = getSettings()
  if (!settings.triageRoleId) return err('not_configured', 'error.no_triage_role')

  // No-op once primed; never a gateway round trip on the request path.
  await primeMemberCache()

  const guild = await getGuild()
  const role = guild.roles.cache.get(settings.triageRoleId)
  if (!role) return err('unknown_role', 'error.triage_role_missing')

  const members = await cached(CacheKey.pendingMembers, CacheTtl.pendingMembers, async () =>
    [...role.members.values()]
      .map((member) => ({
        id: member.id,
        username: member.user.tag,
        displayName: member.displayName,
        avatarUrl: member.displayAvatarURL({ size: 128, extension: 'png' }),
        joinedAt: member.joinedTimestamp,
        createdAt: member.user.createdTimestamp,
      }))
      .sort((a, b) => (b.joinedAt ?? 0) - (a.joinedAt ?? 0)),
  )

  return ok(members)
}

export type GuildDirectory = {
  guild: { id: string; name: string; iconUrl: string | null; memberCount: number }
  roles: { id: string; name: string; color: string; position: number; assignable: boolean }[]
  channels: { id: string; name: string; category: string | null; sendable: boolean }[]
}

export async function getGuildDirectory(): Promise<Result<GuildDirectory>> {
  const directory = await cached(CacheKey.guildDirectory, CacheTtl.guildDirectory, async () => {
    const guild = await getGuild()
    const me = guild.members.me ?? (await guild.members.fetchMe())
    const botTop = me.roles.highest.position

    const roles = [...guild.roles.cache.values()]
      .filter((role) => role.id !== guild.id)
      .sort((a, b) => b.position - a.position)
      .map((role) => ({
        id: role.id,
        name: role.name,
        color: role.hexColor,
        position: role.position,
        assignable: !role.managed && role.position < botTop,
      }))

    const channels = [...guild.channels.cache.values()]
      .filter((channel) => (TEXT_CHANNEL_TYPES as readonly ChannelType[]).includes(channel.type))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((channel) => ({
        id: channel.id,
        name: channel.name,
        category: channel.parent?.name ?? null,
        sendable:
          channel
            .permissionsFor(me)
            ?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]) ?? false,
      }))

    return {
      guild: {
        id: guild.id,
        name: guild.name,
        iconUrl: guild.iconURL({ size: 128 }),
        memberCount: guild.memberCount,
      },
      roles,
      channels,
    }
  })

  return ok(directory)
}

// ---------------------------------------------------------------------------
// Broadcast
// ---------------------------------------------------------------------------

export type BroadcastResult = {
  channelId: string
  channelName: string
  messageId: string
  url: string
}

export async function broadcast(input: {
  channelId: string
  content: string
  actor: Actor
  source: ActionSource
}): Promise<Result<BroadcastResult>> {
  const { channelId, content, actor, source } = input

  const guild = await getGuild()
  const channel =
    guild.channels.cache.get(channelId) ?? (await guild.channels.fetch(channelId).catch(() => null))

  if (!channel?.isTextBased()) {
    return err('unknown_channel', 'error.unknown_channel')
  }

  const me = guild.members.me ?? (await guild.members.fetchMe())
  const canSend = channel
    .permissionsFor(me)
    ?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])

  if (!canSend) {
    return err('channel_not_sendable', 'error.channel_not_sendable', { channel: channel.name })
  }

  try {
    // Mention scope is deliberately left to Discord: the bot only reaches @everyone
    // if its own permissions in the channel allow it.
    const message = await channel.send({ content })

    recordAudit({
      action: 'broadcast.send',
      source,
      actorId: actor.id,
      actorName: actor.name,
      targetId: channel.id,
      targetName: `#${channel.name}`,
      detail: { content, messageId: message.id },
    })

    return ok({
      channelId: channel.id,
      channelName: channel.name,
      messageId: message.id,
      url: message.url,
    })
  } catch (error) {
    console.error(`[broadcast] failed for #${channel.name}:`, error)
    return err('discord_error', 'error.broadcast_rejected')
  }
}
