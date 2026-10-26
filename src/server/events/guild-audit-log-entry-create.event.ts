import { Events } from 'discord.js'

import { logModerationAction } from '../discord/moderation'
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
  },
}
