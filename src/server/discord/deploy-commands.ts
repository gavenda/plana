/**
 * Standalone command registration, for when you want to push command definitions
 * without starting the gateway: `bun run commands:deploy`.
 *
 * The bot also registers commands on every startup, so this is only a convenience.
 */
import { REST, Routes } from 'discord.js'

import { commands } from './commands'
import { env } from '../env'

const rest = new REST().setToken(env.DISCORD_TOKEN)

await rest.put(Routes.applicationGuildCommands(env.DISCORD_CLIENT_ID, env.DISCORD_GUILD_ID), {
  body: commands,
})

console.log(`Registered ${commands.length} command(s) to guild ${env.DISCORD_GUILD_ID}.`)
