import { buttonInteractionEvent } from './events/button-interaction.event'
import { channelCreateEvent } from './events/channel-create.event'
import { channelDeleteEvent } from './events/channel-delete.event'
import { channelUpdateEvent } from './events/channel-update.event'
import { chatInputCommandInteractionEvent } from './events/chat-input-command-interaction.event'
import { clientReadyEvent } from './events/client-ready.event'
import { errorEvent } from './events/error.event'
import { guildAuditLogEntryCreateEvent } from './events/guild-audit-log-entry-create.event'
import { guildMemberAddEvent } from './events/guild-member-add.event'
import { guildMemberRemoveEvent } from './events/guild-member-remove.event'
import { guildMemberUpdateEvent } from './events/guild-member-update.event'
import { guildRoleCreateEvent } from './events/guild-role-create.event'
import { guildRoleDeleteEvent } from './events/guild-role-delete.event'
import { guildRoleUpdateEvent } from './events/guild-role-update.event'
import type { Client } from 'discord.js'

import type { AppContext } from './context'
import type { AnyAppEvent } from './events/event'
import { messageBulkDeleteEvent } from './events/message-bulk-delete.event'
import { messageDeleteEvent } from './events/message-delete.event'
import { messageUpdateEvent } from './events/message-update.event'
import { modalSubmitInteractionEvent } from './events/modal-submit-interaction.event'
import { userCommandInteractionEvent } from './events/user-command-interaction.event'
import { presenceUpdateEvent } from './events/presence-update.event'
import { voiceStateUpdateEvent } from './events/voice-state-update.event'
import { logger } from './logging'

const log = logger('discord')

export const events: AnyAppEvent[] = [
  clientReadyEvent,
  errorEvent,

  guildMemberAddEvent,
  guildMemberUpdateEvent,
  guildMemberRemoveEvent,

  guildRoleCreateEvent,
  guildRoleUpdateEvent,
  guildRoleDeleteEvent,

  channelCreateEvent,
  channelUpdateEvent,
  channelDeleteEvent,

  messageDeleteEvent,
  messageBulkDeleteEvent,
  messageUpdateEvent,
  guildAuditLogEntryCreateEvent,
  voiceStateUpdateEvent,
  presenceUpdateEvent,

  chatInputCommandInteractionEvent,
  userCommandInteractionEvent,
  buttonInteractionEvent,
  modalSubmitInteractionEvent,
]

export function registerEvents(client: Client, context: AppContext): void {
  // Erased emitter type; see AnyAppEvent.
  const emitter = client as unknown as {
    on: (event: string, listener: (...args: never[]) => void) => void
    once: (event: string, listener: (...args: never[]) => void) => void
  }

  for (const appEvent of events) {
    const listener = (...args: never[]) => appEvent.execute(context, ...args)

    if (appEvent.once) emitter.once(appEvent.event, listener)
    else emitter.on(appEvent.event, listener)
  }

  log.info`registered ${events.length} event handler(s)`
}
