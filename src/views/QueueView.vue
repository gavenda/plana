<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'

import StateBlock from '@/components/StateBlock.vue'
import { apiFetch } from '@/lib/api'
import { absoluteTime, relativeTime } from '@/lib/format'
import { useAsync } from '@/lib/useAsync'
import { useGuildStore } from '@/stores/guild'
import { useSettingsStore } from '@/stores/settings'

type PendingMember = {
  id: string
  username: string
  displayName: string
  avatarUrl: string
  joinedAt: number | null
  createdAt: number
}

const NEW_ACCOUNT_MS = 7 * 86_400_000

const guild = useGuildStore()
const settings = useSettingsStore()

const pending = useAsync(() => apiFetch<PendingMember[]>('/api/members/pending'))
const busyId = ref<string | null>(null)
const actionError = ref<string | null>(null)
const lastAssigned = ref<string | null>(null)

onMounted(async () => {
  await Promise.all([guild.load(), settings.load()])
  await pending.run()
})

/** The two configured roles, in the same order as the Discord buttons. */
const assignable = computed(() =>
  [settings.settings.unitOwnerRoleId, settings.settings.boardersRoleId]
    .filter((id): id is string => id != null)
    .map((id) => ({ id, name: guild.roleName(id) ?? 'Unknown role' })),
)

const members = computed(() => pending.data.value ?? [])

async function assign(member: PendingMember, roleId: string) {
  busyId.value = member.id
  actionError.value = null
  try {
    const result = await apiFetch<{ roleName: string; memberName: string }>(
      `/api/members/${member.id}/assign`,
      { method: 'POST', body: { roleId } },
    )
    pending.data.value = members.value.filter((candidate) => candidate.id !== member.id)
    lastAssigned.value = `${result.memberName} → ${result.roleName}`
  } catch (cause) {
    actionError.value = cause instanceof Error ? cause.message : 'Could not assign the role.'
  } finally {
    busyId.value = null
  }
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div v-if="settings.loaded && !settings.configured" class="alert alert-warn">
      Some roles are not configured yet.
      <RouterLink to="/settings" class="font-medium underline underline-offset-2"
        >Finish setup →</RouterLink
      >
    </div>

    <p v-if="actionError" class="alert alert-error">{{ actionError }}</p>
    <p v-else-if="lastAssigned" class="alert alert-success">Assigned {{ lastAssigned }}.</p>

    <div class="card">
      <div class="card-header">
        <div>
          <p class="text-title-medium">Members awaiting a role</p>
          <p class="text-body-medium text-on-surface-variant">
            Everyone currently holding the triage role.
          </p>
        </div>
        <button class="btn btn-text btn-sm" :disabled="pending.loading.value" @click="pending.run">
          Refresh
        </button>
      </div>

      <StateBlock
        :loading="pending.loading.value && members.length === 0"
        :error="pending.error.value"
        :empty="members.length === 0"
        empty-text="Standing by. No one is waiting in triage."
        empty-mood="asleep"
        :retry="pending.run"
      >
        <div class="overflow-x-auto">
          <table class="data-table">
            <thead>
              <tr>
                <th>Member</th>
                <th>Joined</th>
                <th>Account age</th>
                <th class="text-right">Assign</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="member in members" :key="member.id">
                <td>
                  <div class="flex items-center gap-3">
                    <img
                      class="size-10 shrink-0 rounded-full bg-surface-container-highest object-cover"
                      :src="member.avatarUrl"
                      :alt="member.displayName"
                      width="40"
                      height="40"
                    />
                    <div class="flex flex-col leading-tight">
                      <span class="text-body-large">{{ member.displayName }}</span>
                      <span class="font-mono text-body-small text-on-surface-variant">{{
                        member.username
                      }}</span>
                    </div>
                  </div>
                </td>
                <td>
                  <span :title="absoluteTime(member.joinedAt)">
                    {{ relativeTime(member.joinedAt) }}
                  </span>
                </td>
                <td>
                  <span :title="absoluteTime(member.createdAt)">
                    {{ relativeTime(member.createdAt) }}
                  </span>
                  <span
                    v-if="Date.now() - member.createdAt < NEW_ACCOUNT_MS"
                    class="chip chip-warn ml-2"
                  >
                    New
                  </span>
                </td>
                <td class="text-right">
                  <div class="inline-flex flex-wrap justify-end gap-2">
                    <button
                      v-for="(role, index) in assignable"
                      :key="role.id"
                      class="btn btn-sm"
                      :class="index === 0 ? 'btn-filled' : 'btn-tonal'"
                      :disabled="busyId === member.id"
                      @click="assign(member, role.id)"
                    >
                      {{ role.name }}
                    </button>
                    <span
                      v-if="assignable.length === 0"
                      class="text-body-medium text-on-surface-variant"
                    >
                      No roles configured
                    </span>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </StateBlock>
    </div>
  </div>
</template>
