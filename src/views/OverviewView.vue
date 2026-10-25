<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { RouterLink } from 'vue-router'

import AuditSummary from '@/components/AuditSummary.vue'
import StateBlock from '@/components/StateBlock.vue'
import type { ActivityOverview } from '@/lib/activity'
import { apiFetch } from '@/lib/api'
import { auditIcon, describeAudit, toneContainerClass, type AuditPage } from '@/lib/audit'
import { discordTextColor } from '@/lib/discord'
import { absoluteTime, formatDuration, relativeTime } from '@/lib/format'
import { useAsync } from '@/lib/useAsync'
import { useGuildStore } from '@/stores/guild'
import { useSessionStore } from '@/stores/session'
import { useSettingsStore, type GuildSettings } from '@/stores/settings'

type PendingMember = {
  id: string
  displayName: string
  /** Their name's colour in Discord (highest coloured role); #000000 for none. */
  color?: string
  avatarUrl: string
  joinedAt: number | null
}

const guild = useGuildStore()
const settings = useSettingsStore()
const session = useSessionStore()

const pending = useAsync(() => apiFetch<PendingMember[]>('/api/members/pending'))
const activity = useAsync(() => apiFetch<AuditPage>('/api/audit?limit=6'))
const play = useAsync(() => apiFetch<ActivityOverview>('/api/activity?days=7'))

/** How many games and tracks Overview lists; Games & music has the rest. */
const PLAY_LIMIT = 5
const topGames = computed(() => play.data.value?.games.slice(0, PLAY_LIMIT) ?? [])
const topTracks = computed(() => play.data.value?.tracks.slice(0, PLAY_LIMIT) ?? [])

onMounted(async () => {
  await Promise.all([guild.load(), settings.load()])
  // Without a triage role there is no one to list; "Finish setting up" above says so.
  await Promise.all([hasTriageRole.value ? pending.run() : undefined, activity.run(), play.run()])
})

const CHECKLIST: { key: keyof GuildSettings; label: string }[] = [
  { key: 'triageRoleId', label: 'Triage role' },
  { key: 'unitOwnerRoleId', label: 'Unit Owner role' },
  { key: 'boardersRoleId', label: 'Boarders role' },
  { key: 'announceChannelId', label: 'Announcement channel' },
]

const hasTriageRole = computed(() => settings.settings.triageRoleId != null)

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
    <div
      v-if="settings.loaded && missing.length > 0"
      class="card card-warn flex items-center gap-4 py-4 pr-3 pl-6"
    >
      <div class="flex min-w-0 flex-1 flex-col gap-1">
        <p class="text-title-medium">Finish setting up</p>
        <p class="text-body-medium">
          The join flow stays inactive until these are configured:
          <strong class="font-medium">{{ missing.map((item) => item.label).join(', ') }}</strong
          >.
        </p>
      </div>
      <RouterLink
        v-if="session.isAdmin"
        class="btn btn-text text-on-warning-container"
        to="/settings"
        >Open settings</RouterLink
      >
    </div>

    <div class="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-4">
      <component
        :is="stat.to ? RouterLink : 'div'"
        v-for="stat in stats"
        :key="stat.label"
        :to="stat.to ?? undefined"
        class="card flex flex-col gap-1 px-6 py-5 transition-shadow duration-150 ease-effects-fast"
        :class="[stat.tone, stat.to && 'state-layer hover:shadow-level1']"
      >
        <span class="text-display-small font-medium">{{ stat.value }}</span>
        <span class="text-label-large opacity-80">{{ stat.label }}</span>
      </component>
    </div>

    <div class="grid items-start gap-6 expanded:grid-cols-2">
      <section v-if="!settings.loaded || hasTriageRole" aria-labelledby="overview-triage">
        <div class="section-header">
          <h2 id="overview-triage" class="text-title-medium">Waiting in triage</h2>
          <RouterLink class="btn btn-text" to="/queue">View all</RouterLink>
        </div>
        <!-- Loading, empty and error states sit in one card in place of the list. -->
        <div :class="(pending.data.value?.length ?? 0) === 0 && 'card'">
          <StateBlock
            :loading="!settings.loaded || pending.loading.value"
            :error="pending.error.value"
            :empty="(pending.data.value?.length ?? 0) === 0"
            empty-text="Nobody is waiting."
            compact
          >
            <ul class="segmented-list">
              <li
                v-for="member in pending.data.value?.slice(0, 5)"
                :key="member.id"
                class="segmented-item"
              >
                <img
                  class="size-10 shrink-0 rounded-full bg-surface-container-highest object-cover"
                  :src="member.avatarUrl"
                  alt=""
                  width="40"
                  height="40"
                />
                <span
                  class="min-w-0 flex-1 truncate text-body-large"
                  :style="{ color: discordTextColor(member.color) }"
                  >{{ member.displayName }}</span
                >
                <span
                  class="shrink-0 text-label-small text-on-surface-variant"
                  :title="absoluteTime(member.joinedAt)"
                  >{{ relativeTime(member.joinedAt) }}</span
                >
              </li>
            </ul>
          </StateBlock>
        </div>
      </section>

      <section aria-labelledby="overview-activity">
        <div class="section-header">
          <h2 id="overview-activity" class="text-title-medium">Recent activity</h2>
          <RouterLink class="btn btn-text" to="/audit">Full log</RouterLink>
        </div>
        <div :class="recent.length === 0 && 'card'">
          <StateBlock
            :loading="activity.loading.value"
            :error="activity.error.value"
            :empty="recent.length === 0"
            empty-text="No activity recorded."
            compact
          >
            <ul class="segmented-list">
              <li v-for="{ entry, description } in recent" :key="entry.id" class="segmented-item">
                <span
                  class="grid size-10 shrink-0 place-items-center rounded-full"
                  :class="toneContainerClass(description.tone)"
                  aria-hidden="true"
                >
                  <span class="icon [--icon-size:20px]">{{ auditIcon(entry.action) }}</span>
                </span>
                <div class="min-w-0 flex-1 py-1">
                  <p class="truncate text-body-large" :title="description.summary">
                    <AuditSummary :parts="description.parts" />
                  </p>
                  <p class="text-body-medium text-on-surface-variant">{{ description.label }}</p>
                </div>
                <span
                  class="shrink-0 self-start pt-1 text-label-small whitespace-nowrap text-on-surface-variant"
                  :title="absoluteTime(entry.createdAt)"
                  >{{ relativeTime(entry.createdAt) }}</span
                >
              </li>
            </ul>
          </StateBlock>
        </div>
      </section>

      <section aria-labelledby="overview-games">
        <div class="section-header">
          <h2 id="overview-games" class="text-title-medium">Top games this week</h2>
          <RouterLink class="btn btn-text" to="/activity">View all</RouterLink>
        </div>
        <div :class="topGames.length === 0 && 'card'">
          <StateBlock
            :loading="play.loading.value"
            :error="play.error.value"
            :empty="topGames.length === 0"
            empty-text="No games played this week."
            compact
          >
            <ol class="segmented-list">
              <li v-for="(game, index) in topGames" :key="game.name" class="segmented-item p-0">
                <RouterLink
                  :to="{ path: '/activity', query: { game: game.name } }"
                  class="state-layer flex min-h-14 w-full min-w-0 items-center gap-4 rounded-[inherit] px-4 py-2"
                >
                  <span
                    class="w-7 shrink-0 text-center text-label-large tabular-nums"
                    :class="index === 0 ? 'text-primary' : 'text-on-surface-variant'"
                    >#{{ index + 1 }}</span
                  >
                  <img
                    v-if="game.iconUrl"
                    class="size-10 shrink-0 rounded-sm bg-surface-container-highest object-cover"
                    :src="game.iconUrl"
                    alt=""
                    width="40"
                    height="40"
                  />
                  <span
                    v-else
                    class="grid size-10 shrink-0 place-items-center rounded-sm bg-surface-container-highest text-on-surface-variant"
                    aria-hidden="true"
                    ><span class="icon [--icon-size:20px]">sports_esports</span></span
                  >
                  <span class="min-w-0 flex-1 truncate text-body-large" :title="game.name">{{
                    game.name
                  }}</span>
                  <span class="shrink-0 text-body-large tabular-nums">{{
                    formatDuration(game.ms)
                  }}</span>
                </RouterLink>
              </li>
            </ol>
          </StateBlock>
        </div>
      </section>

      <section aria-labelledby="overview-tracks">
        <div class="section-header">
          <h2 id="overview-tracks" class="text-title-medium">Top tracks this week</h2>
          <RouterLink class="btn btn-text" to="/activity">View all</RouterLink>
        </div>
        <div :class="topTracks.length === 0 && 'card'">
          <StateBlock
            :loading="play.loading.value"
            :error="play.error.value"
            :empty="topTracks.length === 0"
            empty-text="Nothing played on Spotify this week."
            compact
          >
            <ol class="segmented-list">
              <li v-for="(track, index) in topTracks" :key="track.id" class="segmented-item">
                <span
                  class="w-7 shrink-0 text-center text-label-large tabular-nums"
                  :class="index === 0 ? 'text-primary' : 'text-on-surface-variant'"
                  >#{{ index + 1 }}</span
                >
                <img
                  v-if="track.artUrl"
                  class="size-10 shrink-0 rounded-sm bg-surface-container-highest object-cover"
                  :src="track.artUrl"
                  :alt="track.album ?? ''"
                  width="40"
                  height="40"
                />
                <span
                  v-else
                  class="grid size-10 shrink-0 place-items-center rounded-sm bg-surface-container-highest text-on-surface-variant"
                  aria-hidden="true"
                  ><span class="icon [--icon-size:20px]">music_note</span></span
                >
                <div class="min-w-0 flex-1 py-1">
                  <p class="truncate text-body-large" :title="track.title">{{ track.title }}</p>
                  <p class="truncate text-body-small text-on-surface-variant">
                    {{ track.artist ?? 'Unknown artist' }}
                  </p>
                </div>
                <span class="shrink-0 text-body-large tabular-nums">{{
                  track.plays === 1 ? '1 play' : `${track.plays.toLocaleString()} plays`
                }}</span>
              </li>
            </ol>
          </StateBlock>
        </div>
      </section>
    </div>
  </div>
</template>
