import { Events } from 'discord.js'

import type { AppEvent } from './event'

export const errorEvent: AppEvent<Events.Error> = {
  event: Events.Error,
  once: false,
  execute: (_context, error) => {
    console.error('[discord] client error:', error)
  },
}
