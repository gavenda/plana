import { Events } from 'discord.js'

import { logMessageDelete } from '../discord/moderation'
import type { AppEvent } from './event'

export const messageDeleteEvent: AppEvent<Events.MessageDelete> = {
  event: Events.MessageDelete,
  once: false,
  execute: (_context, message) => logMessageDelete(message),
}
