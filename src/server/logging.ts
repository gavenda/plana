import {
  configureSync,
  getConsoleSink,
  getLogger,
  getTextFormatter,
  type LogLevel,
  type LogRecord,
  type Sink,
} from '@logtape/logtape'

import { publish } from './live'

/**
 * Logging goes through LogTape. Every logger sits under `plana`, so `logger('backup')` is
 * `plana.backup`. Records go to the console and to the dashboard's log viewer (`logViewerSink`).
 *
 * This module configures LogTape when imported, so entry points import it before anything
 * that might log while loading.
 */
const ROOT = 'plana'

/** How many records the log viewer keeps; older ones are only in the console output. */
const VIEWER_CAPACITY = 1000

export function logger(...category: string[]) {
  return getLogger([ROOT, ...category])
}

/** A record as the log viewer gets it, from `GET /api/logs` or the `logs` live topic. */
export type LogEntry = {
  id: number
  time: number
  level: LogLevel
  /** The category below `plana`, dotted: `discord`, `backup`. */
  category: string
  message: string
  /** Stack traces of any errors in the record. */
  detail: string | null
}

const entries: LogEntry[] = []
let nextId = 1

/** Strings as they are, errors by their message, anything else inspected. */
function render(value: unknown): string {
  if (typeof value === 'string') return value
  if (value instanceof Error) return value.message
  return Bun.inspect(value, { colors: false, depth: 2 })
}

function toEntry(record: LogRecord): LogEntry {
  let message = ''
  const errors = new Set<Error>()
  record.message.forEach((part, index) => {
    // Even indexes are the literal text, odd ones the interpolated values.
    message += index % 2 === 0 ? String(part) : render(part)
    if (part instanceof Error) errors.add(part)
  })
  for (const value of Object.values(record.properties)) {
    if (value instanceof Error) errors.add(value)
  }

  const detail = [...errors].map((error) => error.stack ?? String(error)).join('\n\n')
  return {
    id: nextId++,
    time: record.timestamp,
    level: record.level,
    category: record.category.slice(1).join('.') || ROOT,
    message,
    detail: detail || null,
  }
}

/** Keeps the newest records for the dashboard and streams each one to admins watching. */
const logViewerSink: Sink = (record) => {
  const entry = toEntry(record)
  entries.push(entry)
  if (entries.length > VIEWER_CAPACITY) entries.splice(0, entries.length - VIEWER_CAPACITY)
  publish('logs', { entry })
}

/** The records the log viewer holds, oldest first. */
export function recentLogs(): LogEntry[] {
  return [...entries]
}

configureSync({
  sinks: {
    console: getConsoleSink({
      formatter: getTextFormatter({ timestamp: 'date-time', value: 'bare' }),
    }),
    viewer: logViewerSink,
  },
  loggers: [
    {
      category: [ROOT],
      lowestLevel: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
      sinks: ['console', 'viewer'],
    },
    { category: ['logtape', 'meta'], lowestLevel: 'warning', sinks: ['console'] },
  ],
})
