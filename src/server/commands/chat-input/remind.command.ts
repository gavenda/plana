import { InteractionContextType, MessageFlags, SlashCommandBuilder } from 'discord.js'

import { addReminder, cancelReminder, listMemberReminders } from '../../db/reminders'
import { MAX_REMINDER_DAYS, MAX_REMINDERS_PER_MEMBER, parseDuration } from '../../discord/reminders'
import { env } from '../../env'
import { t, tl } from '../../i18n'
import type { AppChatInputCommand } from './chat-input-command'

const MAX_TEXT = 1000
const MINUTE_MS = 60_000

/** A reminder's text on one short line, for lists and suggestions. */
function preview(text: string, limit: number): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length <= limit ? flat : `${flat.slice(0, limit - 1)}…`
}

export const remindCommand: AppChatInputCommand = {
  name: 'remind',
  data: () =>
    new SlashCommandBuilder()
      .setName('remind')
      .setDescription(t('command.remind.description'))
      .setContexts(InteractionContextType.Guild)
      .addSubcommand((sub) =>
        sub
          .setName('me')
          .setDescription(t('command.remind.me_description'))
          .addStringOption((option) =>
            option
              .setName('in')
              .setDescription(t('command.remind.in_description'))
              .setRequired(true)
              .setMaxLength(40),
          )
          .addStringOption((option) =>
            option
              .setName('about')
              .setDescription(t('command.remind.about_description'))
              .setRequired(true)
              .setMaxLength(MAX_TEXT),
          ),
      )
      .addSubcommand((sub) =>
        sub.setName('list').setDescription(t('command.remind.list_description')),
      )
      .addSubcommand((sub) =>
        sub
          .setName('cancel')
          .setDescription(t('command.remind.cancel_description'))
          .addIntegerOption((option) =>
            option
              .setName('reminder')
              .setDescription(t('command.remind.reminder_description'))
              .setRequired(true)
              .setAutocomplete(true),
          ),
      )
      .toJSON(),

  /** The member's own reminders, matching what they've typed. */
  autocomplete: async (_context, interaction) => {
    const typed = String(interaction.options.getFocused()).trim().toLowerCase()
    // Suggestions are plain text, so the time is written out in the server's zone, named.
    const formatter = new Intl.DateTimeFormat(interaction.locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: env.TIMEZONE,
      timeZoneName: 'short',
    })
    await interaction.respond(
      listMemberReminders(interaction.user.id)
        .filter((reminder) => !typed || reminder.text.toLowerCase().includes(typed))
        .slice(0, 25)
        .map((reminder) => ({
          name: preview(`${formatter.format(reminder.dueAt)} · ${reminder.text}`, 100),
          value: reminder.id,
        })),
    )
  },

  execute: async (_context, interaction) => {
    const locale = interaction.locale
    const reply = (content: string) =>
      interaction.reply({ content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } })

    switch (interaction.options.getSubcommand()) {
      case 'me': {
        const value = interaction.options.getString('in', true)
        const text = interaction.options.getString('about', true).trim()
        const ms = parseDuration(value)
        if (ms == null || !text) {
          await reply(tl('remind.bad_duration', locale, { value }))
          return
        }
        if (ms < MINUTE_MS) {
          await reply(tl('remind.too_soon', locale))
          return
        }
        if (ms > MAX_REMINDER_DAYS * 86_400_000) {
          await reply(tl('remind.too_far', locale, { count: MAX_REMINDER_DAYS }))
          return
        }
        if (listMemberReminders(interaction.user.id).length >= MAX_REMINDERS_PER_MEMBER) {
          await reply(tl('remind.too_many', locale, { count: MAX_REMINDERS_PER_MEMBER }))
          return
        }

        const now = Date.now()
        const dueAt = now + ms
        addReminder({
          memberId: interaction.user.id,
          channelId: interaction.channelId,
          text,
          createdAt: now,
          dueAt,
        })
        await reply(tl('remind.set', locale, { at: Math.floor(dueAt / 1000) }))
        return
      }

      case 'list': {
        const reminders = listMemberReminders(interaction.user.id)
        if (reminders.length === 0) {
          await reply(tl('remind.list_empty', locale))
          return
        }
        const lines = reminders.map((reminder) =>
          tl('remind.list_line', locale, {
            at: Math.floor(reminder.dueAt / 1000),
            text: preview(reminder.text, 80),
          }),
        )
        await reply([tl('remind.list_title', locale), ...lines].join('\n'))
        return
      }

      case 'cancel': {
        const id = interaction.options.getInteger('reminder', true)
        const cancelled = cancelReminder(id, interaction.user.id)
        await reply(
          cancelled
            ? tl('remind.cancelled', locale, { at: Math.floor(cancelled.dueAt / 1000) })
            : tl('remind.not_found', locale),
        )
        return
      }
    }
  },
}
