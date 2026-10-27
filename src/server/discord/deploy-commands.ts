/** Registers commands without starting the gateway (`bun run commands:deploy`); startup does this too. */
import '../logging'

import { REST, Routes } from 'discord.js'

import { chatInputCommandData } from '../commands/chat-input'
import { env } from '../env'

const rest = new REST().setToken(env.DISCORD_TOKEN)

await rest.put(Routes.applicationGuildCommands(env.DISCORD_CLIENT_ID, env.DISCORD_GUILD_ID), {
  body: chatInputCommandData,
})

console.log(
  `Registered ${chatInputCommandData.length} command(s) to guild ${env.DISCORD_GUILD_ID}.`,
)
