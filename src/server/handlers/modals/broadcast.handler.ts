import { MessageFlags } from 'discord.js'

import { BROADCAST_INPUT_ID, BROADCAST_PREFIX, decodeBroadcastId } from '../../discord/ids'
import { broadcast } from '../../discord/service'
import { tl } from '../../i18n'
import { isAdministrator } from '../../utils/is-administrator'
import type { AppModalSubmitHandler } from './modal-handler'

export const broadcastHandler: AppModalSubmitHandler = {
  customId: BROADCAST_PREFIX,
  handle: async (_context, interaction) => {
    const target = decodeBroadcastId(interaction.customId)
    if (!target) return

    const locale = interaction.locale

    if (!isAdministrator(interaction)) {
      await interaction.reply({
        content: tl('reply.not_administrator_broadcast', locale),
        flags: MessageFlags.Ephemeral,
      })
      return
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral })

    const result = await broadcast({
      channelId: target.channelId,
      content: interaction.fields.getTextInputValue(BROADCAST_INPUT_ID),
      actor: { id: interaction.user.id, name: interaction.user.tag },
      source: 'discord',
    })

    await interaction.editReply({
      content: result.ok
        ? tl('reply.broadcast_posted', locale, {
            channelId: result.data.channelId,
            url: result.data.url,
          })
        : `⚠️ ${tl(result.key, locale, result.params)}`,
    })
  },
}
