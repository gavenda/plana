/** Matches LogEntry in src/server/logging.ts. */
export type LogLevel = 'trace' | 'debug' | 'info' | 'warning' | 'error' | 'fatal'

export type LogEntry = {
  id: number
  time: number
  level: LogLevel
  category: string
  message: string
  detail: string | null
}

/** The viewer's level filters; each one shows its own levels. */
export const LOG_FILTERS: { id: string; label: string; levels: LogLevel[] }[] = [
  { id: 'debug', label: 'Debug', levels: ['trace', 'debug'] },
  { id: 'info', label: 'Info', levels: ['info'] },
  { id: 'warning', label: 'Warnings', levels: ['warning'] },
  { id: 'error', label: 'Errors', levels: ['error', 'fatal'] },
]

export const LEVEL_STYLE: Record<LogLevel, { label: string; tone: string }> = {
  trace: { label: 'TRC', tone: 'text-on-surface-variant' },
  debug: { label: 'DBG', tone: 'text-on-surface-variant' },
  info: { label: 'INF', tone: 'text-primary' },
  warning: { label: 'WRN', tone: 'text-warning' },
  error: { label: 'ERR', tone: 'text-error' },
  fatal: { label: 'FTL', tone: 'text-error' },
}

/** Matches VIEWER_CAPACITY in src/server/logging.ts, so live entries don't grow it past that. */
export const LOG_CAPACITY = 1000

/** One line per entry, as in the server's console, for copying. */
export function formatLogEntry(entry: LogEntry): string {
  const time = new Date(entry.time).toISOString()
  const line = `${time} [${LEVEL_STYLE[entry.level].label}] ${entry.category}: ${entry.message}`
  return entry.detail ? `${line}\n${entry.detail}` : line
}
