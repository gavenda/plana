<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { RouterLink } from 'vue-router'

import StateBlock from '@/components/StateBlock.vue'
import { apiFetch } from '@/lib/api'
import { describeAudit, toneClass, type AuditPage } from '@/lib/audit'
import { relativeTime } from '@/lib/format'
import { useAsync } from '@/lib/useAsync'
import { useGuildStore } from '@/stores/guild'
import { useSessionStore } from '@/stores/session'
import { useSettingsStore, type GuildSettings } from '@/stores/settings'

type PendingMember = { id: string; displayName: string; avatarUrl: string; joinedAt: number | null }

const guild = useGuildStore()
const session = useSessionStore()
const settings = useSettingsStore()

/** Her greeting is the page's heading, in place of "Overview" (the rail and the tab still say Overview). */
const greeting = computed(() =>
  session.user ? `Welcome, ${session.user.displayName} Sensei.` : 'Overview',
)

const pending = useAsync(() => apiFetch<PendingMember[]>('/api/members/pending'))
const activity = useAsync(() => apiFetch<AuditPage>('/api/audit?limit=6'))

onMounted(async () => {
  await Promise.all([guild.load(), settings.load()])
  await Promise.all([pending.run(), activity.run()])
})

const CHECKLIST: { key: keyof GuildSettings; label: string }[] = [
  { key: 'triageRoleId', label: 'Triage role' },
  { key: 'unitOwnerRoleId', label: 'Unit Owner role' },
  { key: 'boardersRoleId', label: 'Boarders role' },
  { key: 'announceChannelId', label: 'Announcement channel' },
]

const missing = computed(() => CHECKLIST.filter((item) => settings.settings[item.key] == null))

/** Each tile takes a different tonal container, per M3 Expressive's color emphasis. */
const stats = computed(() => [
  {
    label: 'Awaiting a role',
    value: pending.data.value?.length ?? '—',
    to: '/queue',
    tone: 'bg-primary-container text-on-primary-container',
  },
  {
    label: 'Server members',
    value: guild.directory?.guild.memberCount ?? '—',
    to: null,
    tone: 'bg-secondary-container text-on-secondary-container',
  },
  {
    label: 'Events logged',
    value: activity.data.value?.total ?? '—',
    to: '/audit',
    tone: 'bg-tertiary-container text-on-tertiary-container',
  },
])

const recent = computed(() =>
  (activity.data.value?.entries ?? []).map((entry) => ({
    entry,
    description: describeAudit(entry),
  })),
)
</script>

<template>
  <div class="flex flex-col gap-4">
    <header class="min-w-0 pb-2">
      <h1 class="truncate text-headline-small text-on-surface">{{ greeting }}</h1>
      <p v-if="guild.directory" class="truncate text-body-medium text-on-surface-variant">
        {{ guild.directory.guild.name }} · {{ guild.directory.guild.memberCount }} members
      </p>
    </header>

    <div
      v-if="settings.loaded && missing.length > 0"
      class="flex flex-col items-start gap-2 rounded-xl bg-warning-container p-6 text-on-warning-container"
    >
      <p class="text-title-medium">Finish setting up</p>
      <p class="text-body-medium">
        The join flow stays inactive until these are configured:
        <strong class="font-medium">{{ missing.map((item) => item.label).join(', ') }}</strong
        >.
      </p>
      <RouterLink class="btn btn-filled mt-2" to="/settings">Open settings</RouterLink>
    </div>

    <div class="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-4">
      <component
        :is="stat.to ? RouterLink : 'div'"
        v-for="stat in stats"
        :key="stat.label"
        :to="stat.to ?? undefined"
        class="flex flex-col gap-1 rounded-xl px-6 py-5 transition-[border-radius] duration-350 ease-spatial-fast"
        :class="[stat.tone, stat.to && 'state-layer hover:rounded-2xl active:rounded-lg']"
      >
        <span class="text-display-small font-medium">{{ stat.value }}</span>
        <span class="text-label-large opacity-80">{{ stat.label }}</span>
      </component>
    </div>

    <div class="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] items-start gap-4">
      <div class="card">
        <div class="card-header">
          <p class="text-title-medium">Waiting in triage</p>
          <RouterLink class="btn btn-text" to="/queue">View all</RouterLink>
        </div>
        <StateBlock
          :loading="pending.loading.value"
          :error="pending.error.value"
          :empty="(pending.data.value?.length ?? 0) === 0"
          empty-text="Nobody is waiting."
          compact
        >
          <ul class="pb-2">
            <li
              v-for="member in pending.data.value?.slice(0, 5)"
              :key="member.id"
              class="flex min-h-14 items-center gap-4 px-6 py-2"
            >
              <img
                class="size-10 shrink-0 rounded-full bg-surface-container-highest object-cover"
                :src="member.avatarUrl"
                :alt="member.displayName"
                width="40"
                height="40"
              />
              <span class="min-w-0 flex-1 truncate text-body-large">{{ member.displayName }}</span>
              <span class="text-label-medium text-on-surface-variant">
                {{ relativeTime(member.joinedAt) }}
              </span>
            </li>
          </ul>
        </StateBlock>
      </div>

      <div class="card">
        <div class="card-header">
          <p class="text-title-medium">Recent activity</p>
          <RouterLink class="btn btn-text" to="/audit">Full log</RouterLink>
        </div>
        <StateBlock
          :loading="activity.loading.value"
          :error="activity.error.value"
          :empty="recent.length === 0"
          empty-text="No activity recorded."
          compact
        >
          <ul class="pb-2">
            <li
              v-for="row in recent"
              :key="row.entry.id"
              class="flex min-h-14 items-center gap-4 px-6 py-2"
            >
              <span :class="toneClass(row.description.tone)">{{ row.description.label }}</span>
              <span class="min-w-0 flex-1 truncate text-body-medium">
                {{ row.description.summary }}
              </span>
              <span class="text-label-medium whitespace-nowrap text-on-surface-variant">
                {{ relativeTime(row.entry.createdAt) }}
              </span>
            </li>
          </ul>
        </StateBlock>
      </div>
    </div>
  </div>
</template>
