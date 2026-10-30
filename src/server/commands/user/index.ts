import { setBirthdayCommand } from './set-birthday.command'
import { showBirthdayCommand } from './show-birthday.command'
import { viewStatsCommand } from './view-stats.command'

export const userCommands = [viewStatsCommand, showBirthdayCommand, setBirthdayCommand]

/** What gets PUT to Discord's command registration endpoint. */
export const getUserCommandData = () => userCommands.map((command) => command.data())
