import { Events } from 'discord.js'

import { logMessageDelete } from '../discord/moderation'
import type { AppEvent } from './event'
import { logger } from '../logging'

const log = logger('moderation')

export const messageDeleteEvent: AppEvent<Events.MessageDelete> = {
  event: Events.MessageDelete,
  once: false,
  execute: (_context, message) =>
    logMessageDelete(message).catch((error: unknown) => {
      log.error`could not log a deleted message: ${error}`
    }),
}
