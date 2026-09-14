import { ref } from 'vue'
import { defineStore } from 'pinia'

import { apiFetch } from '@/lib/api'

export type GuildSettings = {
  triageRoleId: string | null
  unitOwnerRoleId: string | null
  boardersRoleId: string | null
  announceChannelId: string | null
}

type SettingsResponse = { settings: GuildSettings; configured: boolean }

const EMPTY: GuildSettings = {
  triageRoleId: null,
  unitOwnerRoleId: null,
  boardersRoleId: null,
  announceChannelId: null,
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
