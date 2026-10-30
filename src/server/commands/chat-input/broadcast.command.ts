import {
  ChannelType,
  InteractionContextType,
  LabelBuilder,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js'

import { MAX_MESSAGE_LENGTH } from '../../constants'
import { BROADCAST_INPUT_ID, encodeBroadcastId } from '../../discord/ids'
import { broadcast } from '../../discord/service'
import { t, tl } from '../../i18n'
import type { AppChatInputCommand } from './chat-input-command'

/** Discord truncates modal titles at 45 characters. */
const MODAL_TITLE_LIMIT = 45

export const broadcastCommand: AppChatInputCommand = {
  name: 'broadcast',
  data: () =>
    new SlashCommandBuilder()
      .setName('broadcast')
      .setDescription(t('command.broadcast.description'))
      // Administrators only by default; a server can open it to other roles under
      // Server Settings → Integrations, and Discord enforces that for the composer too.
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .setContexts(InteractionContextType.Guild)
      .addChannelOption((option) =>
        option
          .setName('channel')
          .setDescription(t('command.broadcast.channel_description'))
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
          .setRequired(true),
      )
      .addStringOption((option) =>
        option
          .setName('message')
          .setDescription(t('command.broadcast.message_description'))
          .setMaxLength(MAX_MESSAGE_LENGTH),
      )
      .toJSON(),

  execute: async (_context, interaction) => {
    const locale = interaction.locale

    const channel = interaction.options.getChannel('channel', true)
    const message = interaction.options.getString('message')

    // No text supplied: open a composer, since a slash command option cannot hold
    // line breaks. The modal handler takes it from there.
    if (!message) {
      const input = new TextInputBuilder()
        .setCustomId(BROADCAST_INPUT_ID)
        .setStyle(TextInputStyle.Paragraph)
        .setMaxLength(MAX_MESSAGE_LENGTH)
        .setRequired(true)

      await interaction.showModal(
        new ModalBuilder()
          .setCustomId(encodeBroadcastId(channel.id))
          .setTitle(
            tl('command.broadcast.modal_title', locale, { channel: channel.name }).slice(
              0,
              MODAL_TITLE_LIMIT,
            ),
          )
          .addLabelComponents(
            new LabelBuilder()
              .setLabel(tl('command.broadcast.modal_input_label', locale))
              .setTextInputComponent(input),
          ),
      )
      return
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral })

    const result = await broadcast({
      channelId: channel.id,
      content: message,
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
