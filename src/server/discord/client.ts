import { Client, GatewayIntentBits, type Guild } from 'discord.js'

import { env } from '../env'

/**
 * `GuildMembers`, `GuildPresences` and `MessageContent` are privileged intents and must be enabled on the
 * application's Bot page. Without the first, `guildMemberAdd` never fires and the member list
 * stays empty; without the second, Discord refuses the connection outright.
 *
 * `GuildMessages` and `MessageContent` let the audit log keep the text of deleted and edited
 * messages. `GuildModeration` delivers moderation actions from Discord's audit log, and
 * `GuildVoiceStates` says who a voice move or disconnect happened to. `GuildPresences` reports
 * the games members play and what they listen to on Spotify, for the Games & music page.
 */
export const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildPresences,
  ],
})

export async function getGuild(): Promise<Guild> {
  const cached = client.guilds.cache.get(env.DISCORD_GUILD_ID)
  if (cached) return cached
  return client.guilds.fetch(env.DISCORD_GUILD_ID)
}

export function isReady(): boolean {
  return client.isReady()
}
