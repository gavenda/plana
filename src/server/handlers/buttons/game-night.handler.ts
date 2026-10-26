import { decodeGameNightId, GAME_NIGHT_PREFIX } from '../../discord/ids'
import { respondToGameNight } from '../../discord/game-nights'
import type { AppButtonHandler } from './button-handler'

/** "I'm in" and "Can't make it" on a game night announcement. Anyone may answer. */
export const gameNightHandler: AppButtonHandler = {
  customId: GAME_NIGHT_PREFIX,
  handle: async (_context, interaction) => {
    const target = decodeGameNightId(interaction.customId)
    if (!target) return
    await respondToGameNight(interaction, target.response)
  },
}
