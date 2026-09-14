import { Events } from 'discord.js'

import { CacheKey, invalidate } from '../cache'
import { isConfiguredGuild } from '../utils/is-configured-guild'
import type { AppEvent } from './event'

export const guildRoleDeleteEvent: AppEvent<Events.GuildRoleDelete> = {
  event: Events.GuildRoleDelete,
  once: false,
  execute: async (_context, role) => {
    if (!isConfiguredGuild(role.guild.id)) return

    // A role's name is the announcement button label, so the queue drops with it.
    await invalidate(CacheKey.guildDirectory, CacheKey.pendingMembers)
  },
}
