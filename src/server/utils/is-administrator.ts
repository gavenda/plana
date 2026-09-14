import { PermissionFlagsBits, type Interaction } from 'discord.js'

/**
 * Commands are hidden from non-administrators by `setDefaultMemberPermissions`, but a
 * server owner can override that per role, so every entry point re-checks.
 */
export function isAdministrator(interaction: Interaction): boolean {
  return interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ?? false
}
