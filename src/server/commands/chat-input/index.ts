import { aboutCommand } from './about.command'
import { birthdayCommand } from './birthday.command'
import { broadcastCommand } from './broadcast.command'
import { statsCommand } from './stats.command'

export const chatInputCommands = [aboutCommand, broadcastCommand, birthdayCommand, statsCommand]

/** What gets PUT to Discord's command registration endpoint. */
export const getChatInputCommandData = () => chatInputCommands.map((command) => command.data())
