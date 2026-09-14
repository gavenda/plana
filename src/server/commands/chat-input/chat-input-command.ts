import type {
  ChatInputCommandInteraction,
  RESTPostAPIChatInputApplicationCommandsJSONBody,
} from 'discord.js'

import type { AppContext } from '../../context'

export interface AppChatInputCommand {
  data: RESTPostAPIChatInputApplicationCommandsJSONBody
  execute: (context: AppContext, interaction: ChatInputCommandInteraction) => Promise<void>
}
