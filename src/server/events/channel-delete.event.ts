import { Events } from 'discord.js'

import { CacheKey, invalidate } from '../cache'
import { isConfiguredGuild } from '../utils/is-configured-guild'
import type { AppEvent } from './event'

export const channelDeleteEvent: AppEvent<Events.ChannelDelete> = {
  event: Events.ChannelDelete,
  once: false,
  execute: async (_context, channel) => {
    if (channel.isDMBased() || !isConfiguredGuild(channel.guild.id)) return

    await invalidate(CacheKey.guildDirectory)
  },
}
