import { S3Client } from 'bun'
import { Database } from 'bun:sqlite'
import { rmSync, writeFileSync } from 'node:fs'

import { db, migrate, restorePaths, SCHEMA_VERSION, type RestoreNote } from './db'
import { env } from './env'
import { notify } from './live'
import { logger } from './logging'
import { restart } from './restart'

const log = logger('backup')

/**
 * Off-site copies of the SQLite database in a Cloudflare R2 bucket. Each backup is the whole
 * database, zstd-compressed, stored under `plana/` with its UTC time in the name. Old backups
 * are expired by an R2 lifecycle rule, unless BACKUP_RETENTION_DAYS is set, in which case the bot
 * deletes older ones itself after each successful upload.
 */

const PREFIX = 'plana/'

/** How often to check whether a backup is due. The interval itself is BACKUP_INTERVAL_HOURS. */
const CHECK_INTERVAL_MS = 15 * 60 * 1000

/** After a failure, wait this long before trying again rather than the full interval. */
const RETRY_AFTER_MS = 30 * 60 * 1000

/** How many backups Settings lists, newest first. */
const LISTED_BACKUPS = 10

let client: S3Client | null = null
let timer: ReturnType<typeof setInterval> | undefined
let lastSuccessAt: number | null = null
let lastFailureAt: number | null = null
let lastError: string | null = null
let running = false

function getClient(): S3Client | null {
  if (!env.R2_ACCOUNT_ID || !env.R2_BUCKET) return null
  client ??= new S3Client({
    // A bucket in a jurisdiction is only reachable on that jurisdiction's endpoint.
    endpoint: `https://${env.R2_ACCOUNT_ID}.${env.R2_JURISDICTION ? `${env.R2_JURISDICTION}.` : ''}r2.cloudflarestorage.com`,
    region: 'auto',
    bucket: env.R2_BUCKET,
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  })
  return client
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** `plana/2026-10-26T02-15-00Z.db.zst`: sorts by time, and the time can be read back. */
function keyFor(time: Date): string {
  return `${PREFIX}${time.toISOString().slice(0, 19).replaceAll(':', '-')}Z.db.zst`
}

function timeOf(key: string): number | null {
  const match = /(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})Z\.db\.zst$/.exec(key)
  if (!match) return null
  const time = Date.parse(`${match[1]}T${match[2]}:${match[3]}:${match[4]}Z`)
  return Number.isNaN(time) ? null : time
}

export type StoredBackup = { key: string; time: number; size: number }

/** Every backup in the bucket, oldest first. Other objects under the prefix are ignored. */
async function listBackups(s3: S3Client): Promise<StoredBackup[]> {
  const backups: StoredBackup[] = []
  let startAfter: string | undefined

  for (;;) {
    const page = await s3.list({ prefix: PREFIX, startAfter })
    for (const object of page.contents ?? []) {
      const time = timeOf(object.key)
      if (time !== null) backups.push({ key: object.key, time, size: object.size ?? 0 })
    }
    if (!page.isTruncated || !page.contents?.length) break
    startAfter = page.contents.at(-1)!.key
  }

  return backups.sort((a, b) => a.time - b.time)
}

/**
 * Deletes backups older than the retention window. The newest is always kept, so a bot that
 * has been unable to back up for a while never ends up with an empty bucket.
 */
async function pruneOld(s3: S3Client): Promise<void> {
  if (env.BACKUP_RETENTION_DAYS === 0) return
  const cutoff = Date.now() - env.BACKUP_RETENTION_DAYS * 86_400_000
  const expired = (await listBackups(s3)).slice(0, -1).filter((backup) => backup.time < cutoff)

  for (const backup of expired) await s3.delete(backup.key)
  if (expired.length > 0) log.info`deleted ${expired.length} expired backup(s)`
}

/**
 * Takes one backup now. `serialize` reads the database inside a read transaction, so the copy
 * is consistent even while the bot keeps writing. Returns the object key it wrote.
 */
export async function backUpNow(): Promise<string> {
  const s3 = getClient()
  if (!s3) throw new Error('Backups are not configured: set the R2_* variables.')

  const snapshot = db.serialize()
  // Header bytes 18 and 19 say "WAL mode"; a lone copy has no -wal file, so mark it as an
  // ordinary rollback-journal database. The bot switches it back to WAL when it opens it.
  snapshot[18] = 1
  snapshot[19] = 1
  const compressed = await Bun.zstdCompress(snapshot, { level: 19 })
  const key = keyFor(new Date())

  await s3.write(key, compressed, { type: 'application/zstd' })
  lastSuccessAt = Date.now()
  lastFailureAt = null
  lastError = null

  const kib = (bytes: number) => `${Math.round(bytes / 1024)} KiB`
  log.info`wrote ${key} (${kib(snapshot.length)} -> ${kib(compressed.length)})`

  // Only after a successful upload, and a failure here does not make the backup a failure.
  try {
    await pruneOld(s3)
  } catch (error) {
    log.warning`could not delete old backups: ${message(error)}`
  }
  return key
}

export type BackupRun = { ok: true; key: string } | { ok: false; busy: boolean; error: string }

/**
 * One backup, never two at once, for both the schedule and the dashboard's "Back up now".
 * Open Settings pages are told when it starts and when it ends.
 */
export async function runBackup(): Promise<BackupRun> {
  if (running) return { ok: false, busy: true, error: 'A backup is already running.' }

  running = true
  notify('backup')
  try {
    return { ok: true, key: await backUpNow() }
  } catch (error) {
    lastFailureAt = Date.now()
    lastError = message(error)
    log.error`failed: ${lastError}`
    return { ok: false, busy: false, error: lastError }
  } finally {
    running = false
    notify('backup')
  }
}

function isDue(now: number): boolean {
  if (lastFailureAt !== null && now - lastFailureAt < RETRY_AFTER_MS) return false
  if (lastSuccessAt === null) return true
  return now - lastSuccessAt >= env.BACKUP_INTERVAL_HOURS * 3_600_000
}

async function tick(): Promise<void> {
  if (!running && isDue(Date.now())) await runBackup()
}

export async function startBackups(): Promise<void> {
  const s3 = getClient()
  if (!s3) {
    log.info`R2 is not configured, off-site backups disabled`
    return
  }

  try {
    lastSuccessAt = (await listBackups(s3)).at(-1)?.time ?? null
    const last = lastSuccessAt ? new Date(lastSuccessAt).toISOString() : 'none yet'
    log.info`R2 bucket ${env.R2_BUCKET} reachable, last backup ${last}`
  } catch (error) {
    // Listing failing usually means wrong credentials; the first upload will say the same.
    log.error`cannot list the R2 bucket: ${message(error)}`
  }

  void tick()
  timer = setInterval(() => void tick(), CHECK_INTERVAL_MS)
}

export function stopBackups(): void {
  clearInterval(timer)
}

export type BackupStatus = 'disabled' | 'pending' | 'ok' | 'failing'

export function backupStatus(): BackupStatus {
  if (!getClient()) return 'disabled'
  if (lastFailureAt !== null) return 'failing'
  return lastSuccessAt === null ? 'pending' : 'ok'
}

/** When the schedule will next try, roughly: it checks every CHECK_INTERVAL_MS. */
function nextDueAt(): number | null {
  if (!getClient() || running) return null
  if (lastFailureAt !== null) return lastFailureAt + RETRY_AFTER_MS
  if (lastSuccessAt === null) return Date.now()
  return lastSuccessAt + env.BACKUP_INTERVAL_HOURS * 3_600_000
}

export type BackupOverview = {
  status: BackupStatus
  running: boolean
  bucket: string | null
  jurisdiction: string | null
  intervalHours: number
  /** 0 when old backups are left to an R2 lifecycle rule. */
  retentionDays: number
  lastSuccessAt: number | null
  lastFailureAt: number | null
  lastError: string | null
  nextDueAt: number | null
  /** The newest few, newest first. */
  backups: StoredBackup[]
  /** How many backups the bucket holds in all. */
  total: number
  /** Why the bucket could not be listed, when it couldn't. */
  listError: string | null
}

/** Everything Settings shows about backups. Lists the bucket, so it costs one R2 request or so. */
export async function getBackupOverview(): Promise<BackupOverview> {
  const s3 = getClient()
  let backups: StoredBackup[] = []
  let listError: string | null = null

  if (s3) {
    try {
      backups = await listBackups(s3)
      // Catches up if the bucket could not be listed at startup.
      const newest = backups.at(-1)?.time ?? null
      if (newest !== null && (lastSuccessAt === null || newest > lastSuccessAt)) {
        lastSuccessAt = newest
      }
    } catch (error) {
      listError = message(error)
    }
  }

  return {
    status: backupStatus(),
    running,
    bucket: s3 ? (env.R2_BUCKET ?? null) : null,
    jurisdiction: env.R2_JURISDICTION ?? null,
    intervalHours: env.BACKUP_INTERVAL_HOURS,
    retentionDays: env.BACKUP_RETENTION_DAYS,
    lastSuccessAt,
    lastFailureAt,
    lastError,
    nextDueAt: nextDueAt(),
    backups: backups.slice(-LISTED_BACKUPS).reverse(),
    total: backups.length,
    listError,
  }
}

export type RestoreRun = { ok: true } | { ok: false; status: 400 | 404 | 409 | 502; error: string }

let restoring = false

/**
 * Replaces the database with a backup. The current database is backed up first, so a restore
 * can be undone by restoring that one. The backup is downloaded, checked and brought up to this
 * version's schema, then staged beside the database; the bot restarts and swaps it in as it
 * starts (see `swapInRestore` in db/index.ts). Sign-ins are carried over, so nobody is signed out.
 */
export async function restoreBackup(
  key: string,
  actor: { id: string; name: string },
): Promise<RestoreRun> {
  const s3 = getClient()
  if (!s3) return { ok: false, status: 409, error: 'Backups are not configured.' }
  if (env.DATABASE_PATH === ':memory:') {
    return { ok: false, status: 409, error: 'The database is in memory, so it cannot be replaced.' }
  }
  if (restoring) return { ok: false, status: 409, error: 'A restore is already under way.' }

  restoring = true
  const { staged, note } = restorePaths(env.DATABASE_PATH)
  try {
    const backups = await listBackups(s3)
    if (!backups.some((backup) => backup.key === key)) {
      return { ok: false, status: 404, error: 'That backup is no longer in the bucket.' }
    }

    const compressed = new Uint8Array(await s3.file(key).arrayBuffer())
    const bytes = await Bun.zstdDecompress(compressed)
    rmSync(staged, { force: true })
    writeFileSync(staged, bytes)

    const problem = prepare(staged)
    if (problem) {
      rmSync(staged, { force: true })
      return { ok: false, status: 400, error: problem }
    }

    // Only once the backup is known to be good, so a bad one doesn't cost a backup.
    const safety = await runBackup()
    if (!safety.ok) {
      rmSync(staged, { force: true })
      return {
        ok: false,
        status: safety.busy ? 409 : 502,
        error: `Could not back up the current database first: ${safety.error}`,
      }
    }

    // Sign-ins from now, so whoever pressed Restore stays signed in.
    db.run('ATTACH DATABASE ? AS restored', [staged])
    try {
      db.transaction(() => {
        db.run('DELETE FROM restored.sessions')
        db.run('INSERT INTO restored.sessions SELECT * FROM main.sessions')
      })()
    } finally {
      db.run('DETACH DATABASE restored')
    }

    const restoreNote: RestoreNote = {
      key,
      safetyKey: safety.key,
      actorId: actor.id,
      actorName: actor.name,
    }
    writeFileSync(note, JSON.stringify(restoreNote))
    log.warning`restoring ${key} for ${actor.name}; restarting`

    // A moment for the answer to reach the dashboard first.
    setTimeout(restart, 1000)
    return { ok: true }
  } catch (error) {
    rmSync(staged, { force: true })
    rmSync(note, { force: true })
    log.error`restore of ${key} failed: ${message(error)}`
    return { ok: false, status: 502, error: message(error) }
  } finally {
    restoring = false
  }
}

/** Checks a downloaded backup and migrates it. Returns what's wrong with it, or null. */
function prepare(path: string): string | null {
  let staged: Database | null = null
  try {
    staged = new Database(path)
    const check = staged.query<{ quick_check: string }, []>('PRAGMA quick_check').get()
    if (check?.quick_check !== 'ok') return 'The backup is damaged.'

    const version = staged.query<{ user_version: number }, []>('PRAGMA user_version').get()
    if ((version?.user_version ?? 0) > SCHEMA_VERSION) {
      return 'The backup is from a newer version of Plana. Update Plana first.'
    }
    const tables = staged
      .query<{ name: string }, []>("SELECT name FROM sqlite_master WHERE name = 'settings'")
      .all()
    if (tables.length === 0) return "The file isn't a Plana database."

    migrate(staged)
    return null
  } catch (error) {
    return `The backup could not be read: ${message(error)}`
  } finally {
    staged?.close()
  }
}
