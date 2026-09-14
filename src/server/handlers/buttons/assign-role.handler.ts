import { MessageFlags } from 'discord.js'

import { ASSIGN_PREFIX, decodeAssignId } from '../../discord/ids'
import { assignRole } from '../../discord/service'
import { tl } from '../../i18n'
import { isAdministrator } from '../../utils/is-administrator'
import type { AppButtonHandler } from './button-handler'

export const assignRoleHandler: AppButtonHandler = {
  customId: ASSIGN_PREFIX,
  handle: async (_context, interaction) => {
    const target = decodeAssignId(interaction.customId)
    if (!target) return

    const locale = interaction.locale

    if (!isAdministrator(interaction)) {
      await interaction.reply({
        content: tl('reply.not_administrator_assign', locale),
        flags: MessageFlags.Ephemeral,
      })
      return
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral })

    const result = await assignRole({
      memberId: target.memberId,
      roleId: target.roleId,
      actor: { id: interaction.user.id, name: interaction.user.tag },
      source: 'discord',
    })

    await interaction.editReply({
      content: result.ok
        ? tl('reply.role_assigned', locale, {
            role: result.data.roleName,
            member: result.data.memberName,
          })
        : `⚠️ ${tl(result.key, locale, result.params)}`,
    })
  },
}
