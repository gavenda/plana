import { getChatInputCommandData } from './chat-input'
import { getUserCommandData } from './user'

/** Every command Discord should know about: slash commands and the user (Apps) menu. */
export const getCommandData = () => [...getChatInputCommandData(), ...getUserCommandData()]
