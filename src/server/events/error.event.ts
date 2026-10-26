import { Events } from 'discord.js'

import type { AppEvent } from './event'
import { logger } from '../logging'

const log = logger('discord')

export const errorEvent: AppEvent<Events.Error> = {
  event: Events.Error,
  once: false,
  execute: (_context, error) => {
    log.error`client error: ${error}`
  },
}
