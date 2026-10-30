import { AuditLogEvent, Events } from 'discord.js'

import { logModerationAction } from '../discord/moderation'
import { adoptManualAssignment } from '../discord/service'
import { isConfiguredGuild } from '../utils/is-configured-guild'
import type { AppEvent } from './event'
import { logger } from '../logging'

const log = logger('moderation')

export const guildAuditLogEntryCreateEvent: AppEvent<Events.GuildAuditLogEntryCreate> = {
  event: Events.GuildAuditLogEntryCreate,
  once: false,
  execute: async (_context, entry, guild) => {
    await logModerationAction(entry, guild).catch((error: unknown) => {
      log.error`could not record an audit log entry: ${error}`
    })

    // A trusted or allowed role given by hand counts as pressing the card's button. Plana's
    // own changes already went through the button path.
    if (
      entry.action === AuditLogEvent.MemberRoleUpdate &&
      isConfiguredGuild(guild.id) &&
      entry.targetId &&
      entry.executorId &&
      entry.executorId !== guild.client.user.id
    ) {
      const added = entry.changes.find((change) => change.key === '$add')?.new
      const addedRoleIds = Array.isArray(added)
        ? added.flatMap((role: { id?: unknown }) => (typeof role.id === 'string' ? [role.id] : []))
        : []
      if (addedRoleIds.length === 0) return

      const executor =
        entry.executor ?? (await guild.client.users.fetch(entry.executorId).catch(() => null))

      await adoptManualAssignment({
        memberId: entry.targetId,
        addedRoleIds,
        actor: {
          id: entry.executorId,
          name: executor?.tag ?? entry.executorId,
        },
      }).catch((error: unknown) => {
        log.error`could not resolve a card after a manual assignment: ${error}`
      })
    }
  },
}
