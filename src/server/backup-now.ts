// `bun run backup` — takes one R2 backup immediately, to check the setup or before an upgrade.
import { backUpNow } from './backup'

try {
  const key = await backUpNow()
  console.log(`Done: ${key}`)
  process.exit(0)
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}
