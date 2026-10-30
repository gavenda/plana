import type {
  RESTPostAPIContextMenuApplicationCommandsJSONBody,
  UserContextMenuCommandInteraction,
} from 'discord.js'

import type { AppContext } from '../../context'

/** An entry in the Apps menu when right-clicking a member. */
export interface AppUserCommand {
  /** What Discord shows in the menu, and how the interaction is routed back here. */
  name: () => string
  /** Built on demand, because the text comes from the locale files loaded at startup. */
  data: () => RESTPostAPIContextMenuApplicationCommandsJSONBody
  execute: (context: AppContext, interaction: UserContextMenuCommandInteraction) => Promise<void>
}
