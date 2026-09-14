import { db } from './index'
import { env } from '../env'

export type GuildSettings = {
  triageRoleId: string | null
  unitOwnerRoleId: string | null
  boardersRoleId: string | null
  announceChannelId: string | null
}

export const SETTING_KEYS = [
  'triageRoleId',
  'unitOwnerRoleId',
  'boardersRoleId',
  'announceChannelId',
] as const satisfies readonly (keyof GuildSettings)[]

const EMPTY: GuildSettings = {
  triageRoleId: null,
  unitOwnerRoleId: null,
  boardersRoleId: null,
  announceChannelId: null,
}

const selectAll = db.query<{ key: string; value: string }, []>('SELECT key, value FROM settings')
const upsert = db.query<void, { key: string; value: string }>(
  'INSERT INTO settings (key, value) VALUES (:key, :value) ' +
    'ON CONFLICT (key) DO UPDATE SET value = excluded.value',
)
const remove = db.query<void, { key: string }>('DELETE FROM settings WHERE key = :key')

export function getSettings(): GuildSettings {
  const settings = { ...EMPTY }
  for (const row of selectAll.all()) {
    if ((SETTING_KEYS as readonly string[]).includes(row.key)) {
      settings[row.key as keyof GuildSettings] = row.value
    }
  }
  return settings
}

/** Writes only the keys present in `patch`; `null` clears a setting. */
export function updateSettings(patch: Partial<GuildSettings>): GuildSettings {
  db.transaction(() => {
    for (const key of SETTING_KEYS) {
      if (!(key in patch)) continue
      const value = patch[key]
      if (value == null || value === '') remove.run({ key })
      else upsert.run({ key, value })
    }
  })()
  return getSettings()
}

/**
 * Copies the optional env seeds into the database once, so a fresh deployment can
 * come up pre-configured. Never overwrites a value already set from the dashboard.
 */
export function seedSettingsFromEnv(): void {
  const current = getSettings()
  const seeds: Partial<GuildSettings> = {
    triageRoleId: env.TRIAGE_ROLE_ID,
    unitOwnerRoleId: env.UNIT_OWNER_ROLE_ID,
    boardersRoleId: env.BOARDERS_ROLE_ID,
    announceChannelId: env.ANNOUNCE_CHANNEL_ID,
  }

  const patch: Partial<GuildSettings> = {}
  for (const key of SETTING_KEYS) {
    if (current[key] == null && seeds[key] != null) patch[key] = seeds[key]
  }

  if (Object.keys(patch).length > 0) {
    updateSettings(patch)
    console.log(`[settings] seeded from environment: ${Object.keys(patch).join(', ')}`)
  }
}

/** True once every setting the join flow depends on has been configured. */
export function isConfigured(settings: GuildSettings = getSettings()): boolean {
  return SETTING_KEYS.every((key) => settings[key] != null)
}
