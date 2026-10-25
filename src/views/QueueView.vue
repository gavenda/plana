<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'

import StateBlock from '@/components/StateBlock.vue'
import { apiFetch } from '@/lib/api'
import { discordTextColor, roleColor } from '@/lib/discord'
import { absoluteTime, relativeTime } from '@/lib/format'
import { useSnackbar } from '@/lib/snackbar'
import { useAsync } from '@/lib/useAsync'
import { useGuildStore } from '@/stores/guild'
import { useSettingsStore } from '@/stores/settings'

type PendingMember = {
  id: string
  username: string
  displayName: string
  /** Their name's colour in Discord (highest coloured role); #000000 for none. */
  color?: string
  avatarUrl: string
  joinedAt: number | null
  createdAt: number
  /** When they reached triage. */
  waitingSince: number | null
}

const DAY_MS = 86_400_000
const NEW_ACCOUNT_MS = 7 * DAY_MS

const guild = useGuildStore()
const settings = useSettingsStore()

const pending = useAsync(() => apiFetch<PendingMember[]>('/api/members/pending'))
const snackbar = useSnackbar()
const busyId = ref<string | null>(null)

/** Without a triage role there is no one to list; the notice above the page says so. */
const hasTriageRole = computed(() => settings.settings.triageRoleId != null)

onMounted(async () => {
  await Promise.all([guild.load(), settings.load()])
  if (hasTriageRole.value) await pending.run()
})

/** The two configured roles, in the same order as the Discord buttons. */
const assignable = computed(() =>
  [settings.settings.unitOwnerRoleId, settings.settings.boardersRoleId]
    .filter((id): id is string => id != null)
    .map((id) => {
      const role = guild.roles.find((candidate) => candidate.id === id)
      return { id, name: role?.name ?? 'Unknown role', color: roleColor(role?.color) }
    }),
)

const members = computed(() => pending.data.value ?? [])

/** Whole days in triage, or null under a day, when the label would only be noise. */
function waitingDays(member: PendingMember): number | null {
  if (member.waitingSince == null) return null
  const days = Math.floor((Date.now() - member.waitingSince) / DAY_MS)
  return days >= 1 ? days : null
}

/** Past the reminder threshold, which is when Plana nudges staff about them. */
function overdue(member: PendingMember): boolean {
  const threshold = settings.settings.triageReminderDays
  const days = waitingDays(member)
  return threshold != null && days != null && days >= threshold
}

async function assign(member: PendingMember, roleId: string) {
  busyId.value = member.id
  try {
    const result = await apiFetch<{ roleName: string; memberName: string }>(
      `/api/members/${member.id}/assign`,
      { method: 'POST', body: { roleId } },
    )
    pending.data.value = members.value.filter((candidate) => candidate.id !== member.id)
    snackbar.show(`Gave ${result.memberName} the ${result.roleName} role.`)
  } catch (cause) {
    snackbar.showError(cause, 'Could not assign the role.')
  } finally {
    busyId.value = null
  }
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div
      v-if="settings.loaded && !settings.configured"
      class="card card-warn flex items-center gap-4 py-3 pr-3 pl-6"
    >
      <p class="min-w-0 flex-1 text-body-medium">
        {{
          hasTriageRole
            ? 'Some roles are not configured yet.'
            : 'No triage role is configured. Choose one to see who is waiting.'
        }}
      </p>
      <RouterLink to="/settings" class="btn btn-text text-on-warning-container"
        >Finish setup</RouterLink
      >
    </div>

    <section v-if="!settings.loaded || hasTriageRole" aria-labelledby="queue-pending">
      <div class="section-header">
        <div>
          <h2 id="queue-pending" class="text-title-medium">Members awaiting a role</h2>
          <p class="text-body-medium text-on-surface-variant">
            Everyone currently holding the triage role, longest wait first.
          </p>
        </div>
        <button
          class="icon-btn icon-btn-tonal icon-btn-narrow"
          type="button"
          aria-label="Refresh"
          title="Refresh"
          :disabled="pending.loading.value"
          @click="pending.run"
        >
          <span class="icon [--icon-size:20px]" aria-hidden="true">refresh</span>
        </button>
      </div>

      <!-- Loading, empty and error states sit in one card in place of the list. -->
      <div :class="members.length === 0 && 'card'">
        <StateBlock
          :loading="(!settings.loaded || pending.loading.value) && members.length === 0"
          :error="pending.error.value"
          :empty="members.length === 0"
          empty-text="Standing by. No one is waiting in triage."
          empty-mood="asleep"
          :retry="pending.run"
        >
          <ul class="segmented-list">
            <li v-for="member in members" :key="member.id" class="segmented-item flex-wrap">
              <img
                class="size-10 shrink-0 rounded-full bg-surface-container-highest object-cover"
                :src="member.avatarUrl"
                alt=""
                width="40"
                height="40"
              />

              <div class="min-w-0 flex-1 basis-40 py-1">
                <p
                  class="truncate text-body-large"
                  :style="{ color: discordTextColor(member.color) }"
                >
                  {{ member.displayName }}
                </p>
                <p class="truncate font-mono text-body-small text-on-surface-variant">
                  {{ member.username }}
                </p>
              </div>

              <div class="flex shrink-0 flex-col items-end text-right">
                <span class="flex items-center gap-2 text-body-medium">
                  <template v-if="waitingDays(member) != null">
                    <span
                      :class="overdue(member) && 'text-warning'"
                      :title="`In triage since ${absoluteTime(member.waitingSince)}`"
                      >Waiting {{ waitingDays(member) }}d</span
                    >
                    <span aria-hidden="true">·</span>
                  </template>
                  <span :title="absoluteTime(member.joinedAt)"
                    >Joined {{ relativeTime(member.joinedAt) }}</span
                  >
                </span>
                <span class="flex items-center gap-2 text-label-small text-on-surface-variant">
                  <template v-if="Date.now() - member.createdAt < NEW_ACCOUNT_MS">
                    <span class="text-warning">New</span>
                    <span aria-hidden="true">·</span>
                  </template>
                  <span :title="absoluteTime(member.createdAt)"
                    >Account made {{ relativeTime(member.createdAt) }}</span
                  >
                </span>
              </div>

              <div class="ml-auto flex shrink-0 flex-wrap justify-end gap-2">
                <button
                  v-for="(role, index) in assignable"
                  :key="role.id"
                  class="btn btn-sm"
                  :class="index === 0 ? 'btn-filled' : 'btn-tonal'"
                  :disabled="busyId === member.id"
                  @click="assign(member, role.id)"
                >
                  <!-- The role's own colour, as Discord shows beside a role; none for a role without one. -->
                  <span
                    v-if="role.color"
                    class="size-2.5 shrink-0 rounded-full ring-1 ring-current/30"
                    :style="{ backgroundColor: role.color }"
                    aria-hidden="true"
                  />
                  {{ role.name }}
                </button>
                <span
                  v-if="assignable.length === 0"
                  class="text-body-medium text-on-surface-variant"
                >
                  No roles configured
                </span>
              </div>
            </li>
          </ul>
        </StateBlock>
      </div>
    </section>
  </div>
</template>
