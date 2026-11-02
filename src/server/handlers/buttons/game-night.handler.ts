import { decodeGameNightId, GAME_NIGHT_PREFIX } from '../../discord/ids'
import { respondToGameNight } from '../../discord/game-nights'
import type { AppButtonHandler } from './button-handler'

/**
 * "I'm in", "Can't make it" and, on a planned night, "Cancel". Anyone may answer; cancelling
 * is for whoever planned it and staff, checked in `respondToGameNight`.
 */
export const gameNightHandler: AppButtonHandler = {
  customId: GAME_NIGHT_PREFIX,
  handle: async (_context, interaction) => {
    const target = decodeGameNightId(interaction.customId)
    if (!target) return
    await respondToGameNight(interaction, target.action)
  },
}
