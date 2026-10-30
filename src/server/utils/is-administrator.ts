import { PermissionFlagsBits, type Interaction } from 'discord.js'

import { getSettings } from '../db/settings'

/**
 * Commands don't need this: `setDefaultMemberPermissions` limits them, and a server can
 * widen that under Integrations on purpose. Buttons on public messages have no such
 * setting, so they check here.
 */
export function isAdministrator(interaction: Interaction): boolean {
  return interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ?? false
}

/** Administrators, plus members holding the configured moderator role. */
export function isStaff(interaction: Interaction): boolean {
  if (isAdministrator(interaction)) return true

  const { moderatorRoleId } = getSettings()
  const roles = interaction.member?.roles
  if (!moderatorRoleId || !roles) return false
  // A cached member carries a role manager; an uncached one, the raw list of IDs.
  return Array.isArray(roles) ? roles.includes(moderatorRoleId) : roles.cache.has(moderatorRoleId)
}
