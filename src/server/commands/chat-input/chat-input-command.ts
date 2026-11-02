import type {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  RESTPostAPIChatInputApplicationCommandsJSONBody,
} from 'discord.js'

import type { AppContext } from '../../context'

export interface AppChatInputCommand {
  name: string
  /** Built on demand, because the text comes from the locale files loaded at startup. */
  data: () => RESTPostAPIChatInputApplicationCommandsJSONBody
  execute: (context: AppContext, interaction: ChatInputCommandInteraction) => Promise<void>
  /** Suggestions for options built with `setAutocomplete(true)`. */
  autocomplete?: (context: AppContext, interaction: AutocompleteInteraction) => Promise<void>
}
