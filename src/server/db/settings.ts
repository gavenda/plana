import { db } from './index'
import { env } from '../env'

export type GuildSettings = {
  triageRoleId: string | null
  unitOwnerRoleId: string | null
  boardersRoleId: string | null
  announceChannelId: string | null
  /** Optional. Birthday announcements are off while it is unset. */
  birthdayChannelId: string | null
  /** Days in triage before staff are reminded. Reminders are off while it is unset. */
  triageReminderDays: number | null
  /** Optional. Members with it can use the dashboard and triage, but not change settings. */
  moderatorRoleId: string | null
  /** Optional. Held by members only on their birthday; off while unset. */
  birthdayRoleId: string | null
}

/** Settings stored as numbers; every other setting is a Discord ID. */
const NUMERIC_KEYS: readonly (keyof GuildSettings)[] = ['triageReminderDays']

export const SETTING_KEYS = [
  'triageRoleId',
  'unitOwnerRoleId',
  'boardersRoleId',
  'announceChannelId',
  'birthdayChannelId',
  'triageReminderDays',
  'birthdayRoleId',
  'moderatorRoleId',
] as const satisfies readonly (keyof GuildSettings)[]

/** The settings the triage flow cannot run without. */
const REQUIRED_SETTING_KEYS = [
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
  birthdayChannelId: null,
  triageReminderDays: null,
  birthdayRoleId: null,
  moderatorRoleId: null,
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
    if (!(SETTING_KEYS as readonly string[]).includes(row.key)) continue
    const key = row.key as keyof GuildSettings
    if (NUMERIC_KEYS.includes(key)) {
      const value = Number(row.value)
      ;(settings as Record<string, unknown>)[key] = Number.isFinite(value) ? value : null
    } else {
      ;(settings as Record<string, unknown>)[key] = row.value
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
      else upsert.run({ key, value: String(value) })
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
    birthdayChannelId: env.BIRTHDAY_CHANNEL_ID,
    birthdayRoleId: env.BIRTHDAY_ROLE_ID,
    moderatorRoleId: env.MODERATOR_ROLE_ID,
  }

  const patch: Partial<Record<keyof GuildSettings, unknown>> = {}
  for (const key of SETTING_KEYS) {
    if (current[key] == null && seeds[key] != null) patch[key] = seeds[key]
  }

  if (Object.keys(patch).length > 0) {
    updateSettings(patch as Partial<GuildSettings>)
    console.log(`[settings] seeded from environment: ${Object.keys(patch).join(', ')}`)
  }
}

/** True once every setting the join flow depends on has been configured. */
export function isConfigured(settings: GuildSettings = getSettings()): boolean {
  return REQUIRED_SETTING_KEYS.every((key) => settings[key] != null)
}
