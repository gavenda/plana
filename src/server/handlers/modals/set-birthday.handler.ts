import { MessageFlags } from 'discord.js'

import { isValidBirthday } from '../../db/birthdays'
import { formatBirthday, saveBirthday } from '../../discord/birthdays'
import {
  BIRTHDAY_DAY_ID,
  BIRTHDAY_MONTH_ID,
  BIRTHDAY_PREFIX,
  decodeBirthdayId,
} from '../../discord/ids'
import { tl, tlList } from '../../i18n'
import type { AppModalSubmitHandler } from './modal-handler'

/** The form from "Set birthday" in a member's Apps menu. */
export const setBirthdayHandler: AppModalSubmitHandler = {
  customId: BIRTHDAY_PREFIX,
  handle: async (_context, interaction) => {
    const target = decodeBirthdayId(interaction.customId)
    if (!target) return

    const locale = interaction.locale
    const reply = (content: string) =>
      interaction.reply({ content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } })

    const month = Number(interaction.fields.getStringSelectValues(BIRTHDAY_MONTH_ID)[0])
    const rawDay = interaction.fields.getTextInputValue(BIRTHDAY_DAY_ID).trim()
    const day = /^\d{1,2}$/.test(rawDay) ? Number(rawDay) : NaN

    if (!isValidBirthday(month, day)) {
      await reply(
        tl('reply.birthday_invalid', locale, {
          month: tlList('months', locale)[month - 1] ?? month,
          day: rawDay,
        }),
      )
      return
    }

    const result = await saveBirthday({
      memberId: target.memberId,
      month,
      day,
      actor: { id: interaction.user.id, name: interaction.user.tag },
      source: 'discord',
    })

    await reply(
      result.ok
        ? tl('reply.birthday_set_other', locale, {
            member: `<@${target.memberId}>`,
            date: formatBirthday({ month, day }, locale),
          })
        : `⚠️ ${tl(result.key, locale, result.params)}`,
    )
  },
}
