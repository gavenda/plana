import type { ModalSubmitInteraction } from 'discord.js'

import type { AppContext } from '../../context'

export interface AppModalSubmitHandler {
  /** Matched on the prefix: broadcast ids carry the target channel (`broadcast:<id>`). */
  customId: string
  handle: (context: AppContext, interaction: ModalSubmitInteraction) => Promise<void>
}
