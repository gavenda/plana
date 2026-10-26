import { Events } from 'discord.js'

import { rememberVoiceChange } from '../discord/moderation'
import { trackVoice } from '../discord/voice'
import type { AppEvent } from './event'

export const voiceStateUpdateEvent: AppEvent<Events.VoiceStateUpdate> = {
  event: Events.VoiceStateUpdate,
  once: false,
  execute: (_context, before, after) => {
    rememberVoiceChange(before, after)
    trackVoice(after)
  },
}
