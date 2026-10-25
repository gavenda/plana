import { PermissionFlagsBits, type Interaction } from 'discord.js'

import { getSettings } from '../db/settings'

/**
 * Commands are hidden from non-administrators by `setDefaultMemberPermissions`, but a
 * server owner can override that per role, so every entry point re-checks.
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
