import { Events } from 'discord.js'

import { logBulkDelete } from '../discord/moderation'
import type { AppEvent } from './event'

export const messageBulkDeleteEvent: AppEvent<Events.MessageBulkDelete> = {
  event: Events.MessageBulkDelete,
  once: false,
  execute: (_context, messages, channel) => logBulkDelete(messages, channel),
}
