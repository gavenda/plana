import { buttonInteractionEvent } from './events/button-interaction.event'
import { channelCreateEvent } from './events/channel-create.event'
import { channelDeleteEvent } from './events/channel-delete.event'
import { channelUpdateEvent } from './events/channel-update.event'
import { chatInputCommandInteractionEvent } from './events/chat-input-command-interaction.event'
import { clientReadyEvent } from './events/client-ready.event'
import { errorEvent } from './events/error.event'
import { guildMemberAddEvent } from './events/guild-member-add.event'
import { guildMemberRemoveEvent } from './events/guild-member-remove.event'
import { guildMemberUpdateEvent } from './events/guild-member-update.event'
import { guildRoleCreateEvent } from './events/guild-role-create.event'
import { guildRoleDeleteEvent } from './events/guild-role-delete.event'
import { guildRoleUpdateEvent } from './events/guild-role-update.event'
import type { Client } from 'discord.js'

import type { AppContext } from './context'
import type { AnyAppEvent } from './events/event'
import { modalSubmitInteractionEvent } from './events/modal-submit-interaction.event'

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

  chatInputCommandInteractionEvent,
  buttonInteractionEvent,
  modalSubmitInteractionEvent,
]

export function registerEvents(client: Client, context: AppContext): void {
  // Every entry is internally consistent — AppEvent<E> ties `event` to its own argument
  // types — but the list is deliberately heterogeneous, so the emitter cannot be typed
  // against a union of event names. One narrow cast here keeps all of the event files
  // themselves fully typed.
  const emitter = client as unknown as {
    on: (event: string, listener: (...args: never[]) => void) => void
    once: (event: string, listener: (...args: never[]) => void) => void
  }

  for (const appEvent of events) {
    const listener = (...args: never[]) => appEvent.execute(context, ...args)

    if (appEvent.once) emitter.once(appEvent.event, listener)
    else emitter.on(appEvent.event, listener)
  }

  console.log(`[discord] registered ${events.length} event handler(s)`)
}
