import { Events } from 'discord.js'

import { trackPresence } from '../discord/activity'
import type { AppEvent } from './event'

export const presenceUpdateEvent: AppEvent<Events.PresenceUpdate> = {
  event: Events.PresenceUpdate,
  once: false,
  execute: (_context, _before, after) => trackPresence(after),
}
