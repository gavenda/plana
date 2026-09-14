import { Events } from 'discord.js'

import { CacheKey, invalidate } from '../cache'
import { isConfiguredGuild } from '../utils/is-configured-guild'
import type { AppEvent } from './event'

export const guildRoleUpdateEvent: AppEvent<Events.GuildRoleUpdate> = {
  event: Events.GuildRoleUpdate,
  once: false,
  execute: async (_context, _before, role) => {
    if (!isConfiguredGuild(role.guild.id)) return

    // A role's name is the announcement button label, so the queue drops with it.
    await invalidate(CacheKey.guildDirectory, CacheKey.pendingMembers)
  },
}
