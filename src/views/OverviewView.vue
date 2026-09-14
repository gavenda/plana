<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { RouterLink } from 'vue-router'

import StateBlock from '@/components/StateBlock.vue'
import { apiFetch } from '@/lib/api'
import { describeAudit, toneClass, type AuditPage } from '@/lib/audit'
import { relativeTime } from '@/lib/format'
import { useAsync } from '@/lib/useAsync'
import { useGuildStore } from '@/stores/guild'
import { useSettingsStore, type GuildSettings } from '@/stores/settings'

type PendingMember = { id: string; displayName: string; avatarUrl: string; joinedAt: number | null }

const guild = useGuildStore()
const settings = useSettingsStore()

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

const stats = computed(() => [
  { label: 'Awaiting a role', value: pending.data.value?.length ?? '—', to: '/queue' },
  { label: 'Server members', value: guild.directory?.guild.memberCount ?? '—', to: null },
  { label: 'Events logged', value: activity.data.value?.total ?? '—', to: '/audit' },
])

const recent = computed(() =>
  (activity.data.value?.entries ?? []).map((entry) => ({
    entry,
    description: describeAudit(entry),
  })),
)
</script>

<template>
  <div class="flex flex-col gap-5">
    <div
      v-if="settings.loaded && missing.length > 0"
      class="rounded-lg border border-warn/40 bg-warn/15 p-5"
    >
      <div class="flex flex-col items-start gap-2">
        <p class="text-[15px] font-semibold">Finish setting up</p>
        <p class="text-muted">
          The join flow stays inactive until these are configured:
          <strong>{{ missing.map((item) => item.label).join(', ') }}</strong
          >.
        </p>
        <RouterLink class="btn btn-primary btn-sm mt-1" to="/settings">Open settings</RouterLink>
      </div>
    </div>

    <div class="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-4">
      <component
        :is="stat.to ? RouterLink : 'div'"
        v-for="stat in stats"
        :key="stat.label"
        :to="stat.to ?? undefined"
        class="flex flex-col gap-0.5 rounded-lg border border-line bg-surface px-5 py-[18px]"
        :class="stat.to ? 'transition-colors hover:border-line-strong hover:bg-raised' : ''"
      >
        <span class="text-[28px] font-semibold tracking-tight">{{ stat.value }}</span>
        <span class="text-[13px] text-faint">{{ stat.label }}</span>
      </component>
    </div>

    <div class="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] items-start gap-5">
      <div class="rounded-lg border border-line bg-surface">
        <div class="flex items-center justify-between gap-4 border-b border-line px-5 py-4">
          <p class="text-[15px] font-semibold">Waiting in triage</p>
          <RouterLink class="btn btn-ghost btn-sm" to="/queue">View all</RouterLink>
        </div>
        <StateBlock
          :loading="pending.loading.value"
          :error="pending.error.value"
          :empty="(pending.data.value?.length ?? 0) === 0"
          empty-text="Nobody is waiting."
        >
          <ul class="m-0 list-none p-0 [&>li:last-child]:border-b-0">
            <li
              v-for="member in pending.data.value?.slice(0, 5)"
              :key="member.id"
              class="flex items-center gap-[11px] border-b border-line px-5 py-3 text-sm"
            >
              <img
                class="shrink-0 rounded-full bg-raised object-cover"
                :src="member.avatarUrl"
                :alt="member.displayName"
                width="30"
                height="30"
              />
              <span class="min-w-0 flex-1">{{ member.displayName }}</span>
              <span class="text-[13px] text-faint">{{ relativeTime(member.joinedAt) }}</span>
            </li>
          </ul>
        </StateBlock>
      </div>

      <div class="rounded-lg border border-line bg-surface">
        <div class="flex items-center justify-between gap-4 border-b border-line px-5 py-4">
          <p class="text-[15px] font-semibold">Recent activity</p>
          <RouterLink class="btn btn-ghost btn-sm" to="/audit">Full log</RouterLink>
        </div>
        <StateBlock
          :loading="activity.loading.value"
          :error="activity.error.value"
          :empty="recent.length === 0"
          empty-text="No activity recorded."
        >
          <ul class="m-0 list-none p-0 [&>li:last-child]:border-b-0">
            <li
              v-for="row in recent"
              :key="row.entry.id"
              class="flex items-center gap-[11px] border-b border-line px-5 py-3 text-sm"
            >
              <span :class="toneClass(row.description.tone)">{{ row.description.label }}</span>
              <span class="min-w-0 flex-1 truncate">{{ row.description.summary }}</span>
              <span class="text-[13px] whitespace-nowrap text-faint">
                {{ relativeTime(row.entry.createdAt) }}
              </span>
            </li>
          </ul>
        </StateBlock>
      </div>
    </div>
  </div>
</template>
