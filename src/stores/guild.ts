import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import { apiFetch } from '@/lib/api'

export type GuildRole = {
  id: string
  name: string
  color: string
  position: number
  assignable: boolean
}

export type GuildChannel = {
  id: string
  name: string
  category: string | null
  sendable: boolean
}

export type GuildDirectory = {
  guild: { id: string; name: string; iconUrl: string | null; memberCount: number }
  roles: GuildRole[]
  channels: GuildChannel[]
}

export const useGuildStore = defineStore('guild', () => {
  const directory = ref<GuildDirectory | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  const roles = computed(() => directory.value?.roles ?? [])
  const channels = computed(() => directory.value?.channels ?? [])

  function roleName(id: string | null): string | null {
    if (!id) return null
    return roles.value.find((role) => role.id === id)?.name ?? null
  }

  async function load(force = false) {
    if (loading.value) return
    if (directory.value && !force) return

    loading.value = true
    error.value = null
    try {
      directory.value = await apiFetch<GuildDirectory>('/api/guild')
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'Could not load the server directory.'
    } finally {
      loading.value = false
    }
  }

  return { directory, loading, error, roles, channels, roleName, load }
})
