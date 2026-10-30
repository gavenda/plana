import { Events } from 'discord.js'

import { logBulkDelete } from '../discord/moderation'
import type { AppEvent } from './event'
import { logger } from '../logging'

const log = logger('moderation')

export const messageBulkDeleteEvent: AppEvent<Events.MessageBulkDelete> = {
  event: Events.MessageBulkDelete,
  once: false,
  execute: (_context, messages, channel) =>
    logBulkDelete(messages, channel).catch((error: unknown) => {
      log.error`could not log a deleted message: ${error}`
    }),
}
