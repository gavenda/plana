import { Events } from 'discord.js'

import { CacheKey, invalidate } from '../cache'
import { isConfiguredGuild } from '../utils/is-configured-guild'
import type { AppEvent } from './event'

export const channelCreateEvent: AppEvent<Events.ChannelCreate> = {
  event: Events.ChannelCreate,
  once: false,
  execute: async (_context, channel) => {
    if (!isConfiguredGuild(channel.guild.id)) return

    await invalidate(CacheKey.guildDirectory)
  },
}
