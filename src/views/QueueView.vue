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
  <div class="flex flex-col gap-5">
    <div v-if="settings.loaded && !settings.configured" class="alert alert-warn">
      Some roles are not configured yet.
      <RouterLink to="/settings" class="underline">Finish setup →</RouterLink>
    </div>

    <p v-if="actionError" class="alert alert-error">{{ actionError }}</p>
    <p v-else-if="lastAssigned" class="alert alert-success">Assigned {{ lastAssigned }}.</p>

    <div class="rounded-lg border border-line bg-surface">
      <div class="flex items-center justify-between gap-4 border-b border-line px-5 py-4">
        <div>
          <p class="text-[15px] font-semibold">Members awaiting a role</p>
          <p class="text-[13px] text-faint">Everyone currently holding the triage role.</p>
        </div>
        <button class="btn btn-ghost btn-sm" :disabled="pending.loading.value" @click="pending.run">
          Refresh
        </button>
      </div>

      <StateBlock
        :loading="pending.loading.value && members.length === 0"
        :error="pending.error.value"
        :empty="members.length === 0"
        empty-text="No one is waiting in triage."
      >
        <div class="overflow-x-auto">
          <table class="w-full border-collapse">
            <thead>
              <tr
                class="[&>th]:border-b [&>th]:border-line [&>th]:px-5 [&>th]:py-2.5 [&>th]:text-left [&>th]:text-xs [&>th]:font-semibold [&>th]:tracking-wider [&>th]:text-faint [&>th]:uppercase"
              >
                <th>Member</th>
                <th>Joined</th>
                <th>Account age</th>
                <th class="!text-right">Assign</th>
              </tr>
            </thead>
            <tbody
              class="[&>tr:last-child>td]:border-b-0 [&>tr>td]:border-b [&>tr>td]:border-line [&>tr>td]:px-5 [&>tr>td]:py-3 [&>tr>td]:align-middle"
            >
              <tr v-for="member in members" :key="member.id">
                <td>
                  <div class="flex items-center gap-[11px]">
                    <img
                      class="shrink-0 rounded-full bg-raised object-cover"
                      :src="member.avatarUrl"
                      :alt="member.displayName"
                      width="34"
                      height="34"
                    />
                    <div class="flex flex-col leading-tight">
                      <span class="font-medium">{{ member.displayName }}</span>
                      <span class="font-mono text-xs text-muted">{{ member.username }}</span>
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
                    class="badge badge-warn ml-2"
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
                      :class="index === 0 ? 'btn-primary' : 'btn-secondary'"
                      :disabled="busyId === member.id"
                      @click="assign(member, role.id)"
                    >
                      {{ role.name }}
                    </button>
                    <span v-if="assignable.length === 0" class="text-[13px] text-faint">
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
