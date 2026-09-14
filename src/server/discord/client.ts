import { Client, GatewayIntentBits, type Guild } from 'discord.js'

import { env } from '../env'

/**
 * `GuildMembers` is a privileged intent and must be enabled on the application's
 * Bot page, otherwise `guildMemberAdd` never fires and the member list stays empty.
 */
export const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
})

export async function getGuild(): Promise<Guild> {
  const cached = client.guilds.cache.get(env.DISCORD_GUILD_ID)
  if (cached) return cached
  return client.guilds.fetch(env.DISCORD_GUILD_ID)
}

export function isReady(): boolean {
  return client.isReady()
}
