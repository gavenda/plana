import { decodeStatsId, STATS_PREFIX } from '../../discord/ids'
import { renderStats } from '../../discord/stats'
import type { AppButtonHandler } from './button-handler'

/** Games, Music and Voice on a /stats reply: redraws the same reply on the chosen tab. */
export const statsHandler: AppButtonHandler = {
  customId: STATS_PREFIX,
  handle: async (_context, interaction) => {
    const target = decodeStatsId(interaction.customId)
    if (!target) return

    await interaction.deferUpdate()
    await interaction.editReply(
      await renderStats(target.memberId, target.days, target.tab, interaction.locale),
    )
  },
}
