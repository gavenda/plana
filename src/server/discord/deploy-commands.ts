/** Registers commands without starting the gateway (`bun run commands:deploy`); startup does this too. */
import '../logging'

import { REST, Routes } from 'discord.js'

import { getChatInputCommandData } from '../commands/chat-input'
import { env } from '../env'
import { initI18n } from '../i18n'

await initI18n()

const chatInputCommandData = getChatInputCommandData()
const rest = new REST().setToken(env.DISCORD_TOKEN)

await rest.put(Routes.applicationGuildCommands(env.DISCORD_CLIENT_ID, env.DISCORD_GUILD_ID), {
  body: chatInputCommandData,
})

console.log(
  `Registered ${chatInputCommandData.length} command(s) to guild ${env.DISCORD_GUILD_ID}.`,
)
