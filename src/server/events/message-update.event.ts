import { Events } from 'discord.js'

import { logMessageEdit } from '../discord/moderation'
import type { AppEvent } from './event'

export const messageUpdateEvent: AppEvent<Events.MessageUpdate> = {
  event: Events.MessageUpdate,
  once: false,
  execute: (_context, before, after) => logMessageEdit(before, after),
}
