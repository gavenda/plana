<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { RouterLink } from 'vue-router'

import AuditSummary from '@/components/AuditSummary.vue'
import SkeletonList from '@/components/SkeletonList.vue'
import StateBlock from '@/components/StateBlock.vue'
import type { ActivityOverview } from '@/lib/activity'
import { apiFetch } from '@/lib/api'
import { formatUntil, type UpcomingBirthdays } from '@/lib/birthdays'
import { formatMonthDay } from '@/lib/dates'
import { auditIcon, describeAudit, toneContainerClass, type AuditPage } from '@/lib/audit'
import { discordTextColor } from '@/lib/discord'
import { absoluteTime, formatDuration, relativeTime } from '@/lib/format'
import { useAsync } from '@/lib/useAsync'
import { useLive } from '@/lib/live'
import type { VoiceOverview } from '@/lib/voice'
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

/** How many audit entries "Recent activity" shows. */
const RECENT_LIMIT = 6

const pending = useAsync(() => apiFetch<PendingMember[]>('/api/members/pending'))
const activity = useAsync(() => apiFetch<AuditPage>(`/api/audit?limit=${RECENT_LIMIT}`))
const play = useAsync(() => apiFetch<ActivityOverview>('/api/activity?days=7'))
const upcoming = useAsync(() => apiFetch<UpcomingBirthdays>('/api/birthdays/upcoming'))
const voice = useAsync(() => apiFetch<VoiceOverview>('/api/voice?days=7'))

/** How many games and tracks Overview lists; Games & music has the rest. */
const PLAY_LIMIT = 5
const topGames = computed(() => play.data.value?.games.slice(0, PLAY_LIMIT) ?? [])
const topTracks = computed(() => play.data.value?.tracks.slice(0, PLAY_LIMIT) ?? [])
const topVoice = computed(() => voice.data.value?.members.slice(0, PLAY_LIMIT) ?? [])
const topChannels = computed(() => voice.data.value?.channels.slice(0, PLAY_LIMIT) ?? [])

/** How many players a game's subtext names before counting the rest. */
const NAMED_PLAYERS = 3

/** "Alice, Bob, Carol and 4 others": who played most, by name, then how many more. */
function playerNames(game: ActivityOverview['games'][number]): string {
  const names = game.top.slice(0, NAMED_PLAYERS).map((player) => player.displayName)
  const others = Math.max(game.players - names.length, 0)
  if (names.length === 0) {
    return others === 1 ? '1 player' : `${others.toLocaleString()} players`
  }
  if (others > 0) {
    return `${names.join(', ')} and ${others === 1 ? '1 other' : `${others.toLocaleString()} others`}`
  }
  return names.length === 1 ? names[0]! : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
}

/** Loading, or not started yet: each request waits for the guild and settings first. */
const waiting = (state: { data: { value: unknown }; error: { value: unknown } }) =>
  state.data.value == null && state.error.value == null
const pendingLoading = computed(() => !settings.loaded || waiting(pending))
const activityLoading = computed(() => waiting(activity))
const playLoading = computed(() => waiting(play))
const upcomingLoading = computed(() => waiting(upcoming))
const voiceLoading = computed(() => waiting(voice))
const birthdays = computed(() => upcoming.data.value?.birthdays ?? [])

onMounted(async () => {
  await Promise.all([guild.load(), settings.load()])
  // Without a triage role there is no one to list; "Finish setting up" above says so.
  await Promise.all([
    hasTriageRole.value ? pending.run() : undefined,
    activity.run(),
    play.run(),
    voice.run(),
    upcoming.run(),
  ])
})

// Live updates. Each waits for the first load to finish, so a message never stands in for it.
useLive('triage', () => {
  if (hasTriageRole.value && !waiting(pending)) void pending.run()
})
useLive('audit', (message) => {
  const page = activity.data.value
  if (!page) return
  if (!message) return void activity.run()
  if (page.entries.some((entry) => entry.id === message.entry.id)) return
  activity.data.value = {
    ...page,
    entries: [message.entry, ...page.entries].slice(0, RECENT_LIMIT),
    total: page.total + 1,
  }
})
useLive('presence', (message) => {
  if (!play.data.value) return
  if (message) play.data.value = { ...play.data.value, ...message }
  else void play.run()
})
useLive('voice', () => {
  if (!waiting(voice)) void voice.run()
})
useLive('birthdays', () => {
  if (!waiting(upcoming)) void upcoming.run()
})

const CHECKLIST: { key: keyof GuildSettings; label: string }[] = [
  { key: 'triageRoleId', label: 'Triage role' },
  { key: 'unitOwnerRoleId', label: 'Unit Owner role' },
  { key: 'boardersRoleId', label: 'Boarders role' },
  { key: 'announceChannelId', label: 'Announcement channel' },
]

const hasTriageRole = computed(() => settings.settings.triageRoleId != null)

const missing = computed(() => CHECKLIST.filter((item) => settings.settings[item.key] == null))

/** People, not activities: someone in two games at once counts once. */
const countMembers = (entries: { member: { id: string } }[]) =>
  new Set(entries.map((entry) => entry.member.id)).size

const stats = computed(() => [
  {
    label: 'Awaiting a role',
    value: pending.data.value?.length ?? '—',
    loading: (!settings.loaded || hasTriageRole.value) && pendingLoading.value,
    to: '/queue',
  },
  {
    label: 'Server members',
    value: guild.directory?.guild.memberCount ?? '—',
    loading: !guild.directory && !guild.error,
    to: null,
  },
  {
    label: 'Playing now',
    value: play.data.value ? countMembers(play.data.value.playing) : '—',
    loading: playLoading.value,
    to: '/activity',
  },
  {
    label: 'Listening now',
    value: play.data.value ? countMembers(play.data.value.listening) : '—',
    loading: playLoading.value,
    to: '/activity',
  },
  {
    label: 'In voice now',
    value: voice.data.value?.now.length ?? '—',
    loading: voiceLoading.value,
    to: '/voice',
  },
  {
    label: 'Birthdays this month',
    value: upcoming.data.value?.thisMonth ?? '—',
    loading: upcomingLoading.value,
    to: '/birthdays',
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
        :class="stat.to && 'state-layer hover:shadow-level1'"
      >
        <span class="text-display-small font-medium">
          <span
            v-if="stat.loading"
            class="skeleton inline-block h-[0.8em] w-[1.6em] align-middle"
          />
          <template v-else>{{ stat.value }}</template>
        </span>
        <span class="text-label-large opacity-80">{{ stat.label }}</span>
      </component>
    </div>

    <div class="grid items-start gap-6 expanded:grid-cols-2">
      <section aria-labelledby="overview-activity">
        <div class="section-header">
          <h2 id="overview-activity" class="text-title-medium">Recent activity</h2>
          <RouterLink class="btn btn-text" to="/audit">Full log</RouterLink>
        </div>
        <div :class="!activityLoading && recent.length === 0 && 'card'">
          <StateBlock
            :loading="activityLoading"
            :error="activity.error.value"
            :empty="recent.length === 0"
            empty-text="No activity recorded."
            compact
          >
            <template #skeleton><SkeletonList two-line trailing="text" /></template>
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

      <section v-if="!settings.loaded || hasTriageRole" aria-labelledby="overview-triage">
        <div class="section-header">
          <h2 id="overview-triage" class="text-title-medium">Waiting in triage</h2>
          <RouterLink class="btn btn-text" to="/queue">View all</RouterLink>
        </div>
        <!-- Loading, empty and error states sit in one card in place of the list. -->
        <div :class="!pendingLoading && (pending.data.value?.length ?? 0) === 0 && 'card'">
          <StateBlock
            :loading="pendingLoading"
            :error="pending.error.value"
            :empty="(pending.data.value?.length ?? 0) === 0"
            empty-text="Nobody is waiting."
            compact
          >
            <template #skeleton><SkeletonList trailing="text" /></template>
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

      <section aria-labelledby="overview-games">
        <div class="section-header">
          <h2 id="overview-games" class="text-title-medium">Top games this week</h2>
          <RouterLink class="btn btn-text" to="/activity">View all</RouterLink>
        </div>
        <div :class="!playLoading && topGames.length === 0 && 'card'">
          <StateBlock
            :loading="playLoading"
            :error="play.error.value"
            :empty="topGames.length === 0"
            empty-text="No games played this week."
            compact
          >
            <template #skeleton>
              <SkeletonList leading="art" rank two-line trailing="text" />
            </template>
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
                  <div class="min-w-0 flex-1 py-1">
                    <p class="truncate text-body-large" :title="game.name">{{ game.name }}</p>
                    <p
                      class="truncate text-body-small text-on-surface-variant"
                      :title="game.top.map((player) => player.displayName).join(', ')"
                    >
                      {{ playerNames(game) }}
                    </p>
                  </div>
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
        <div :class="!playLoading && topTracks.length === 0 && 'card'">
          <StateBlock
            :loading="playLoading"
            :error="play.error.value"
            :empty="topTracks.length === 0"
            empty-text="Nothing played on Spotify this week."
            compact
          >
            <template #skeleton>
              <SkeletonList leading="art" rank two-line trailing="text" />
            </template>
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

      <section aria-labelledby="overview-voice">
        <div class="section-header">
          <h2 id="overview-voice" class="text-title-medium">Most time in voice this week</h2>
          <RouterLink class="btn btn-text" to="/voice">View all</RouterLink>
        </div>
        <div :class="!voiceLoading && topVoice.length === 0 && 'card'">
          <StateBlock
            :loading="voiceLoading"
            :error="voice.error.value"
            :empty="topVoice.length === 0"
            empty-text="Nobody spent time in voice this week."
            compact
          >
            <template #skeleton><SkeletonList rank two-line trailing="stack" /></template>
            <ol class="segmented-list">
              <li v-for="(member, index) in topVoice" :key="member.id" class="segmented-item p-0">
                <RouterLink
                  :to="{ path: '/voice', query: { member: member.id } }"
                  class="state-layer flex min-h-14 w-full min-w-0 items-center gap-4 rounded-[inherit] px-4 py-2"
                >
                  <span
                    class="w-7 shrink-0 text-center text-label-large tabular-nums"
                    :class="index === 0 ? 'text-primary' : 'text-on-surface-variant'"
                    >#{{ index + 1 }}</span
                  >
                  <img
                    class="size-10 shrink-0 rounded-full bg-surface-container-highest object-cover"
                    :src="member.avatarUrl"
                    alt=""
                    width="40"
                    height="40"
                  />
                  <div class="min-w-0 flex-1 py-1">
                    <p
                      class="truncate text-body-large"
                      :style="{ color: discordTextColor(member.color) }"
                    >
                      {{ member.displayName }}
                    </p>
                    <p class="truncate text-body-small text-on-surface-variant">
                      {{
                        member.sessions === 1
                          ? '1 session'
                          : `${member.sessions.toLocaleString()} sessions`
                      }}
                    </p>
                  </div>
                  <div class="flex shrink-0 flex-col items-end">
                    <span class="text-body-large tabular-nums">{{
                      formatDuration(member.ms)
                    }}</span>
                    <span
                      v-if="member.inVoiceSince != null"
                      class="text-label-small text-tertiary"
                      :title="`Since ${absoluteTime(member.inVoiceSince)}`"
                      >In voice now</span
                    >
                  </div>
                </RouterLink>
              </li>
            </ol>
          </StateBlock>
        </div>
      </section>

      <section aria-labelledby="overview-channels">
        <div class="section-header">
          <h2 id="overview-channels" class="text-title-medium">Busiest voice channels this week</h2>
          <RouterLink class="btn btn-text" to="/voice">View all</RouterLink>
        </div>
        <div :class="!voiceLoading && topChannels.length === 0 && 'card'">
          <StateBlock
            :loading="voiceLoading"
            :error="voice.error.value"
            :empty="topChannels.length === 0"
            empty-text="No voice channels used this week."
            compact
          >
            <template #skeleton><SkeletonList rank two-line trailing="stack" /></template>
            <ol class="segmented-list">
              <li v-for="(channel, index) in topChannels" :key="channel.id" class="segmented-item">
                <span
                  class="w-7 shrink-0 text-center text-label-large tabular-nums"
                  :class="index === 0 ? 'text-primary' : 'text-on-surface-variant'"
                  >#{{ index + 1 }}</span
                >
                <span
                  class="grid size-10 shrink-0 place-items-center rounded-sm bg-surface-container-highest text-on-surface-variant"
                  aria-hidden="true"
                  ><span class="icon [--icon-size:20px]">volume_up</span></span
                >
                <div class="min-w-0 flex-1 py-1">
                  <p class="truncate text-body-large" :title="channel.name">{{ channel.name }}</p>
                  <p class="truncate text-body-small text-on-surface-variant">
                    {{
                      channel.members === 1
                        ? '1 member'
                        : `${channel.members.toLocaleString()} members`
                    }}
                  </p>
                </div>
                <div class="flex shrink-0 flex-col items-end">
                  <span class="text-body-large tabular-nums">{{ formatDuration(channel.ms) }}</span>
                  <span class="text-label-small text-on-surface-variant">Active</span>
                </div>
              </li>
            </ol>
          </StateBlock>
        </div>
      </section>

      <section aria-labelledby="overview-birthdays">
        <div class="section-header">
          <h2 id="overview-birthdays" class="text-title-medium">Upcoming birthdays</h2>
          <RouterLink class="btn btn-text" to="/birthdays">View all</RouterLink>
        </div>
        <div :class="!upcomingLoading && birthdays.length === 0 && 'card'">
          <StateBlock
            :loading="upcomingLoading"
            :error="upcoming.error.value"
            :empty="birthdays.length === 0"
            empty-text="No birthdays in the next 30 days."
            compact
          >
            <template #skeleton><SkeletonList two-line trailing="stack" /></template>
            <ul class="segmented-list">
              <li v-for="entry in birthdays" :key="entry.id" class="segmented-item">
                <img
                  class="size-10 shrink-0 rounded-full bg-surface-container-highest object-cover"
                  :src="entry.avatarUrl"
                  alt=""
                  width="40"
                  height="40"
                />
                <div class="min-w-0 flex-1 py-1">
                  <p
                    class="truncate text-body-large"
                    :style="{ color: discordTextColor(entry.color) }"
                  >
                    {{ entry.displayName }}
                  </p>
                  <p class="truncate font-mono text-body-small text-on-surface-variant">
                    {{ entry.username }}
                  </p>
                </div>
                <div class="flex shrink-0 flex-col items-end">
                  <span class="text-body-large">{{ formatMonthDay(entry.month, entry.day) }}</span>
                  <span
                    class="text-label-small"
                    :class="entry.daysUntil === 0 ? 'text-tertiary' : 'text-on-surface-variant'"
                    >{{ formatUntil(entry.daysUntil) }}</span
                  >
                </div>
              </li>
            </ul>
          </StateBlock>
        </div>
      </section>
    </div>
  </div>
</template>
