import { birthdayCommand } from './birthday.command'
import { broadcastCommand } from './broadcast.command'

export const chatInputCommands = [broadcastCommand, birthdayCommand]

/** What gets PUT to Discord's command registration endpoint. */
export const chatInputCommandData = chatInputCommands.map((command) => command.data)
