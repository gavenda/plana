import {
  ActionRowBuilder,
  Events,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Client,
  type Interaction,
  type ModalSubmitInteraction,
} from 'discord.js'

import { commands, MAX_MESSAGE_LENGTH } from './commands'
import { BROADCAST_INPUT_ID, decodeAssignId, decodeBroadcastId, encodeBroadcastId } from './ids'
import { announceJoin, assignRole, broadcast, primeMemberCache, type Actor } from './service'
import { CacheKey, invalidate } from '../cache'
import { env } from '../env'

const EPHEMERAL = { flags: MessageFlags.Ephemeral } as const

function actorOf(interaction: Interaction): Actor {
  return {
    id: interaction.user.id,
    name: interaction.user.tag,
  }
}

function isAdministrator(interaction: Interaction): boolean {
  return interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ?? false
}

// ---------------------------------------------------------------------------

async function handleAssignButton(interaction: ButtonInteraction): Promise<void> {
  const target = decodeAssignId(interaction.customId)
  if (!target) return

  if (!isAdministrator(interaction)) {
    await interaction.reply({
      content: 'Only administrators can assign roles from this message.',
      ...EPHEMERAL,
    })
    return
  }

  await interaction.deferReply(EPHEMERAL)

  const result = await assignRole({
    memberId: target.memberId,
    roleId: target.roleId,
    actor: actorOf(interaction),
    source: 'discord',
  })

  await interaction.editReply({
    content: result.ok
      ? `Assigned **${result.data.roleName}** to **${result.data.memberName}**.`
      : `⚠️ ${result.message}`,
  })
}

async function handleBroadcastCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!isAdministrator(interaction)) {
    await interaction.reply({
      content: 'Only administrators can broadcast.',
      ...EPHEMERAL,
    })
    return
  }

  const channel = interaction.options.getChannel('channel', true)
  const message = interaction.options.getString('message')

  // No text supplied: open a composer so the author can write multiple lines,
  // which a slash command option cannot capture.
  if (!message) {
    const input = new TextInputBuilder()
      .setCustomId(BROADCAST_INPUT_ID)
      .setLabel('Message')
      .setStyle(TextInputStyle.Paragraph)
      .setMaxLength(MAX_MESSAGE_LENGTH)
      .setRequired(true)

    await interaction.showModal(
      new ModalBuilder()
        .setCustomId(encodeBroadcastId(channel.id))
        .setTitle(`Broadcast to #${channel.name}`.slice(0, 45))
        .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input)),
    )
    return
  }

  await interaction.deferReply(EPHEMERAL)
  await sendBroadcast(interaction, channel.id, message)
}

async function handleBroadcastModal(interaction: ModalSubmitInteraction): Promise<void> {
  const target = decodeBroadcastId(interaction.customId)
  if (!target) return

  if (!isAdministrator(interaction)) {
    await interaction.reply({ content: 'Only administrators can broadcast.', ...EPHEMERAL })
    return
  }

  await interaction.deferReply(EPHEMERAL)
  const content = interaction.fields.getTextInputValue(BROADCAST_INPUT_ID)
  await sendBroadcast(interaction, target.channelId, content)
}

async function sendBroadcast(
  interaction: ChatInputCommandInteraction | ModalSubmitInteraction,
  channelId: string,
  content: string,
): Promise<void> {
  const result = await broadcast({
    channelId,
    content,
    actor: actorOf(interaction),
    source: 'discord',
  })

  await interaction.editReply({
    content: result.ok
      ? `Posted to <#${result.data.channelId}> — ${result.data.url}`
      : `⚠️ ${result.message}`,
  })
}

// ---------------------------------------------------------------------------

export function registerEvents(client: Client): void {
  client.once(Events.ClientReady, async (ready) => {
    console.log(`[discord] logged in as ${ready.user.tag}`)

    try {
      const guild = await ready.guilds.fetch(env.DISCORD_GUILD_ID)
      await guild.commands.set(commands)
      console.log(`[discord] registered ${commands.length} command(s) in ${guild.name}`)
    } catch (error) {
      console.error('[discord] command registration failed:', error)
    }

    // The single Request Guild Members call this process makes.
    await primeMemberCache().catch((error: unknown) => {
      console.error('[discord] member cache priming failed:', error)
    })
  })

  client.on(Events.GuildMemberAdd, async (member) => {
    if (member.guild.id !== env.DISCORD_GUILD_ID) return

    await invalidate(CacheKey.pendingMembers)

    const result = await announceJoin(member)
    if (!result.ok) console.warn(`[join] ${member.user.tag}: ${result.message}`)
  })

  // Gateway events keep discord.js's member cache current, so the derived Redis
  // entries are dropped as they arrive rather than waiting for their TTL.
  const forGuild = (id: string) => id === env.DISCORD_GUILD_ID

  client.on(Events.GuildMemberRemove, (member) => {
    if (forGuild(member.guild.id)) void invalidate(CacheKey.pendingMembers)
  })

  client.on(Events.GuildMemberUpdate, (_before, after) => {
    if (forGuild(after.guild.id)) void invalidate(CacheKey.pendingMembers)
  })

  // A renamed role changes the announcement button labels, so the queue drops too.
  const dropRoles = (guildId: string) => {
    if (forGuild(guildId)) void invalidate(CacheKey.guildDirectory, CacheKey.pendingMembers)
  }

  client.on(Events.GuildRoleCreate, (role) => dropRoles(role.guild.id))
  client.on(Events.GuildRoleUpdate, (_before, role) => dropRoles(role.guild.id))
  client.on(Events.GuildRoleDelete, (role) => dropRoles(role.guild.id))

  const dropChannels = (guildId: string) => {
    if (forGuild(guildId)) void invalidate(CacheKey.guildDirectory)
  }

  client.on(Events.ChannelCreate, (channel) => dropChannels(channel.guild.id))
  client.on(Events.ChannelUpdate, (_before, channel) => {
    if (!channel.isDMBased()) dropChannels(channel.guild.id)
  })
  client.on(Events.ChannelDelete, (channel) => {
    if (!channel.isDMBased()) dropChannels(channel.guild.id)
  })

  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      if (interaction.isButton()) {
        await handleAssignButton(interaction)
      } else if (interaction.isChatInputCommand() && interaction.commandName === 'broadcast') {
        await handleBroadcastCommand(interaction)
      } else if (interaction.isModalSubmit()) {
        await handleBroadcastModal(interaction)
      }
    } catch (error) {
      console.error('[discord] interaction handler threw:', error)

      if (interaction.isRepliable()) {
        const payload = { content: 'Something went wrong handling that.', ...EPHEMERAL }
        await (
          interaction.deferred || interaction.replied
            ? interaction.followUp(payload)
            : interaction.reply(payload)
        ).catch(() => {})
      }
    }
  })

  client.on(Events.Error, (error) => console.error('[discord] client error:', error))
}
