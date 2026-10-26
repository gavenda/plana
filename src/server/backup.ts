import { S3Client } from 'bun'

import { db } from './db'
import { env } from './env'

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

let client: S3Client | null = null
let timer: ReturnType<typeof setInterval> | undefined
let lastSuccessAt: number | null = null
let lastFailureAt: number | null = null
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

type StoredBackup = { key: string; time: number }

/** Every backup in the bucket, oldest first. Other objects under the prefix are ignored. */
async function listBackups(s3: S3Client): Promise<StoredBackup[]> {
  const backups: StoredBackup[] = []
  let startAfter: string | undefined

  for (;;) {
    const page = await s3.list({ prefix: PREFIX, startAfter })
    for (const object of page.contents ?? []) {
      const time = timeOf(object.key)
      if (time !== null) backups.push({ key: object.key, time })
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
  if (expired.length > 0) console.log(`[backup] deleted ${expired.length} expired backup(s)`)
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

  const kib = (bytes: number) => `${Math.round(bytes / 1024)} KiB`
  console.log(`[backup] wrote ${key} (${kib(snapshot.length)} -> ${kib(compressed.length)})`)

  // Only after a successful upload, and a failure here does not make the backup a failure.
  try {
    await pruneOld(s3)
  } catch (error) {
    console.warn(
      '[backup] could not delete old backups:',
      error instanceof Error ? error.message : error,
    )
  }
  return key
}

function isDue(now: number): boolean {
  if (lastFailureAt !== null && now - lastFailureAt < RETRY_AFTER_MS) return false
  if (lastSuccessAt === null) return true
  return now - lastSuccessAt >= env.BACKUP_INTERVAL_HOURS * 3_600_000
}

async function tick(): Promise<void> {
  if (running || !isDue(Date.now())) return
  running = true
  try {
    await backUpNow()
  } catch (error) {
    lastFailureAt = Date.now()
    console.error('[backup] failed:', error instanceof Error ? error.message : error)
  } finally {
    running = false
  }
}

export async function startBackups(): Promise<void> {
  const s3 = getClient()
  if (!s3) {
    console.log('[backup] R2 is not configured, off-site backups disabled')
    return
  }

  try {
    lastSuccessAt = (await listBackups(s3)).at(-1)?.time ?? null
    const last = lastSuccessAt ? new Date(lastSuccessAt).toISOString() : 'none yet'
    console.log(`[backup] R2 bucket ${env.R2_BUCKET} reachable, last backup ${last}`)
  } catch (error) {
    // Listing failing usually means wrong credentials; the first upload will say the same.
    console.error(
      '[backup] cannot list the R2 bucket:',
      error instanceof Error ? error.message : error,
    )
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
