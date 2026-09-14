import { Events } from 'discord.js'

import { CacheKey, invalidate } from '../cache'
import { isConfiguredGuild } from '../utils/is-configured-guild'
import type { AppEvent } from './event'

export const guildMemberRemoveEvent: AppEvent<Events.GuildMemberRemove> = {
  event: Events.GuildMemberRemove,
  once: false,
  execute: async (_context, member) => {
    if (!isConfiguredGuild(member.guild.id)) return

    await invalidate(CacheKey.pendingMembers)
  },
}
