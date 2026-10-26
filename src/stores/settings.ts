import { ref } from 'vue'
import { defineStore } from 'pinia'

import { apiFetch } from '@/lib/api'

export type GuildSettings = {
  triageRoleId: string | null
  unitOwnerRoleId: string | null
  boardersRoleId: string | null
  announceChannelId: string | null
  birthdayChannelId: string | null
  /** Where the weekly recap is posted; null is off. */
  recapChannelId: string | null
  /** Days in triage before staff are reminded; null is off. */
  triageReminderDays: number | null
  /** Can use the dashboard and triage, but not change settings; null is administrators only. */
  moderatorRoleId: string | null
  /** Held by members only on their birthday; null is off. */
  birthdayRoleId: string | null
  /** Reverse proxies in front of the app; null is none. */
  trustedProxyHops: number | null
}

type SettingsResponse = { settings: GuildSettings; configured: boolean }

const EMPTY: GuildSettings = {
  triageRoleId: null,
  unitOwnerRoleId: null,
  boardersRoleId: null,
  announceChannelId: null,
  birthdayChannelId: null,
  recapChannelId: null,
  triageReminderDays: null,
  birthdayRoleId: null,
  moderatorRoleId: null,
  trustedProxyHops: null,
}

export const useSettingsStore = defineStore('settings', () => {
  const settings = ref<GuildSettings>({ ...EMPTY })
  const configured = ref(false)
  const loaded = ref(false)
  const loading = ref(false)
  const error = ref<string | null>(null)

  function apply(response: SettingsResponse) {
    settings.value = response.settings
    configured.value = response.configured
    loaded.value = true
  }

  async function load(force = false) {
    if (loading.value || (loaded.value && !force)) return

    loading.value = true
    error.value = null
    try {
      apply(await apiFetch<SettingsResponse>('/api/settings'))
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'Could not load settings.'
    } finally {
      loading.value = false
    }
  }

  async function save(patch: Partial<GuildSettings>) {
    apply(await apiFetch<SettingsResponse>('/api/settings', { method: 'PUT', body: patch }))
  }

  return { settings, configured, loaded, loading, error, load, save }
})
