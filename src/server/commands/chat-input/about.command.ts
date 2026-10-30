import {
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  SectionBuilder,
  SeparatorBuilder,
  SlashCommandBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
} from 'discord.js'

import { version } from '../../../../package.json'
import { t, tl } from '../../i18n'
import type { AppChatInputCommand } from './chat-input-command'

const SOURCE_URL = 'https://github.com/gavenda/plana'

export const aboutCommand: AppChatInputCommand = {
  name: 'about',
  data: () =>
    new SlashCommandBuilder()
      .setName('about')
      .setDescription(t('command.about.description'))
      .toJSON(),

  execute: async (_context, interaction) => {
    // The interaction's client is always logged in, so its user is never null.
    const me = interaction.client.user
    const locale = interaction.locale
    const field = (key: string, value: string) =>
      new TextDisplayBuilder().setContent(`-# ${tl(`about.${key}`, locale)}\n${value}`)

    const created = new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(me.createdAt)

    // Top-level components, with no container around them.
    await interaction.reply({
      flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
      components: [
        new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`# ${tl('about.title', locale)}`),
            new TextDisplayBuilder().setContent(tl('about.description', locale)),
          )
          .setThumbnailAccessory(
            new ThumbnailBuilder()
              .setURL(me.displayAvatarURL({ size: 256 }))
              .setDescription(tl('announcement.avatar_alt', locale, { username: me.username })),
          ),
        field('field_version', version),
        field('field_language', '[TypeScript](https://www.typescriptlang.org/)'),
        field('field_host', '[GreenCloud VPS](https://greencloudvps.com/)'),
        field('field_created', created),
        new SeparatorBuilder(),
        new SectionBuilder()
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(tl('about.footer', locale)))
          .setButtonAccessory(
            new ButtonBuilder()
              .setStyle(ButtonStyle.Link)
              .setLabel(tl('about.source', locale))
              .setURL(SOURCE_URL),
          ),
      ],
    })
  },
}
