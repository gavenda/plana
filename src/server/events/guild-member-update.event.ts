import { Events } from 'discord.js'

import { CacheKey, invalidate } from '../cache'
import { getSettings } from '../db/settings'
import { announceIfInTriage } from '../discord/service'
import { isConfiguredGuild } from '../utils/is-configured-guild'
import type { AppEvent } from './event'

export const guildMemberUpdateEvent: AppEvent<Events.GuildMemberUpdate> = {
  event: Events.GuildMemberUpdate,
  once: false,
  execute: async (_context, before, after) => {
    if (!isConfiguredGuild(after.guild.id)) return

    await invalidate(CacheKey.pendingMembers)

    const { triageRoleId } = getSettings()
    if (!triageRoleId) return

    // Only the transition into triage announces, so unrelated edits (a nickname, some
    // other role) stay quiet. An uncached `before` cannot answer that, so it falls
    // through to announceTriage, which refuses to post a second card.
    if (!before.partial && before.roles.cache.has(triageRoleId)) return

    await announceIfInTriage(after)
  },
}
