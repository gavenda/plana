import {
  ChannelType,
  InteractionContextType,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type RESTPostAPIApplicationCommandsJSONBody,
} from 'discord.js'

export const MAX_MESSAGE_LENGTH = 2000

/**
 * `setDefaultMemberPermissions(Administrator)` hides the command from everyone else
 * in the client. The handler re-checks anyway, since server owners can override this.
 */
const broadcast = new SlashCommandBuilder()
  .setName('broadcast')
  .setDescription('Post a message to a channel as the bot')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .setContexts(InteractionContextType.Guild)
  .addChannelOption((option) =>
    option
      .setName('channel')
      .setDescription('Channel to post in')
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
      .setRequired(true),
  )
  .addStringOption((option) =>
    option
      .setName('message')
      .setDescription('Message text. Omit this to open a multi-line composer instead.')
      .setMaxLength(MAX_MESSAGE_LENGTH),
  )

export const commands: RESTPostAPIApplicationCommandsJSONBody[] = [broadcast.toJSON()]
