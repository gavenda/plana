import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  ThumbnailBuilder,
  type GuildMember,
  type Role,
} from 'discord.js'

import { encodeAssignId } from './ids'

const ACCENT_PENDING = 0x5865f2
const ACCENT_RESOLVED = 0x57f287

/** Discord allows 38 characters on a button label when there is no emoji. */
const LABEL_LIMIT = 38

function truncate(value: string, limit = LABEL_LIMIT): string {
  return value.length <= limit ? value : `${value.slice(0, limit - 1)}…`
}

function relative(date: Date): string {
  return `<t:${Math.floor(date.getTime() / 1000)}:R>`
}

function describeMember(member: GuildMember): string {
  const lines = [
    `## Welcome ${member.toString()}`,
    `**${member.user.tag}** — \`${member.id}\``,
    `Account created ${relative(member.user.createdAt)}`,
  ]
  if (member.joinedAt) lines.push(`Joined this server ${relative(member.joinedAt)}`)
  return lines.join('\n')
}

function memberSection(member: GuildMember, body: string): SectionBuilder {
  return new SectionBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(body))
    .setThumbnailAccessory(
      new ThumbnailBuilder()
        .setURL(member.displayAvatarURL({ size: 256, extension: 'png' }))
        .setDescription(`${member.user.username}'s avatar`),
    )
}

function divider(): SeparatorBuilder {
  return new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
}

/**
 * The join announcement: member card plus one button per assignable role, each
 * labelled with the role's own name so the buttons stay correct if a role is renamed.
 */
export function buildJoinAnnouncement(member: GuildMember, roles: Role[]): ContainerBuilder {
  const container = new ContainerBuilder()
    .setAccentColor(ACCENT_PENDING)
    .addSectionComponents(memberSection(member, describeMember(member)))
    .addSeparatorComponents(divider())

  if (roles.length === 0) {
    return container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        '-# ⚠️ No assignable roles are configured yet. Set them in the dashboard.',
      ),
    )
  }

  const buttons = roles.map((role, index) =>
    new ButtonBuilder()
      .setCustomId(encodeAssignId({ memberId: member.id, roleId: role.id }))
      .setLabel(truncate(role.name))
      .setStyle(index === 0 ? ButtonStyle.Primary : ButtonStyle.Secondary),
  )

  return container
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('Assign a role to move them out of triage:'),
    )
    .addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(buttons))
}

/**
 * Replaces the announcement once a decision is made. The buttons are dropped rather
 * than disabled so the message reads as a record instead of a dead control.
 */
export function buildResolvedAnnouncement(options: {
  member: GuildMember
  roleName: string
  actorName: string
  source: 'discord' | 'dashboard'
}): ContainerBuilder {
  const { member, roleName, actorName, source } = options
  const via = source === 'dashboard' ? ' via the dashboard' : ''

  return new ContainerBuilder()
    .setAccentColor(ACCENT_RESOLVED)
    .addSectionComponents(memberSection(member, describeMember(member)))
    .addSeparatorComponents(divider())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `✅ Assigned **${roleName}** by **${actorName}**${via} ${relative(new Date())}`,
      ),
    )
}
