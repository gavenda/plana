import { Events } from 'discord.js'

import { CacheKey, invalidate } from '../cache'
import { isConfiguredGuild } from '../utils/is-configured-guild'
import type { AppEvent } from './event'

export const channelUpdateEvent: AppEvent<Events.ChannelUpdate> = {
  event: Events.ChannelUpdate,
  once: false,
  execute: async (_context, _before, channel) => {
    if (channel.isDMBased() || !isConfiguredGuild(channel.guild.id)) return

    await invalidate(CacheKey.guildDirectory)
  },
}
