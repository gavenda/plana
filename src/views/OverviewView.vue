<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import { Card, List, ListItem } from 'tailwind-material3'

import LinkButton from '@/components/LinkButton.vue'
import AuditSummary from '@/components/AuditSummary.vue'
import SkeletonList from '@/components/SkeletonList.vue'
import StateBlock from '@/components/StateBlock.vue'
import TrendChart from '@/components/TrendChart.vue'
import type { ActivityOverview, DailyTrends, TrendMetric } from '@/lib/activity'
import { apiFetch } from '@/lib/api'
import { formatUntil, type UpcomingBirthdays } from '@/lib/birthdays'
import { formatMonthDay } from '@/lib/dates'
import { auditIcon, describeAudit, toneContainerClass, type AuditPage } from '@/lib/audit'
import { discordTextColor } from '@/lib/discord'
import { absoluteTime, formatDuration, relativeTime } from '@/lib/format'
import { rankClass } from '@/lib/rank'
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
const daily = useAsync(() => apiFetch<DailyTrends>('/api/activity/daily'))

const TRENDS: { metric: TrendMetric; label: string; icon: string }[] = [
  { metric: 'voice', label: 'Hours in voice', icon: 'headset_mic' },
  { metric: 'games', label: 'Hours played', icon: 'sports_esports' },
  { metric: 'music', label: 'Hours of music', icon: 'music_note' },
]

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

/** Viewers (the stats role) get the stats only: no triage, audit log or settings. */
const staff = computed(() => !session.isViewer)

onMounted(async () => {
  if (!staff.value) {
    await Promise.all([guild.load(), play.run(), voice.run(), upcoming.run(), daily.run()])
    return
  }
  await Promise.all([guild.load(), settings.load()])
  // Without a triage role there is no one to list; "Finish setting up" above says so.
  await Promise.all([
    hasTriageRole.value ? pending.run() : undefined,
    activity.run(),
    play.run(),
    voice.run(),
    upcoming.run(),
    daily.run(),
  ])
})

// Live updates. Each waits for the first load to finish, so a message never stands in for it.
useLive('triage', () => {
  if (staff.value && hasTriageRole.value && !waiting(pending)) void pending.run()
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

const stats = computed(() =>
  [
    {
      staffOnly: true,
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
      to: staff.value ? '/birthdays' : null,
    },
  ]
    .filter((stat) => staff.value || !('staffOnly' in stat))
    .map(({ label, value, loading, to }) => ({ label, value, loading, to })),
)

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
      class="flex items-center gap-4 overflow-hidden rounded-medium bg-warning-container py-4 pr-3 pl-6 text-on-warning-container"
    >
      <div class="flex min-w-0 flex-1 flex-col gap-1">
        <p class="text-title-medium">Finish setting up</p>
        <p class="text-body-medium">
          The join flow stays inactive until these are configured:
          <strong class="font-medium">{{ missing.map((item) => item.label).join(', ') }}</strong
          >.
        </p>
      </div>
      <LinkButton v-if="session.isAdmin" variant="inherit" to="/settings">Open settings</LinkButton>
    </div>

    <div class="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-4">
      <Card
        v-for="stat in stats"
        :key="stat.label"
        :as="stat.to ? RouterLink : 'div'"
        :to="stat.to ?? undefined"
        :interactive="!!stat.to"
        :padded="false"
        class="flex flex-col gap-1 bg-surface-container! px-6 py-5"
      >
        <span class="text-display-small font-medium">
          <span
            v-if="stat.loading"
            class="skeleton inline-block h-[0.8em] w-[1.6em] align-middle"
          />
          <template v-else>{{ stat.value }}</template>
        </span>
        <span class="text-label-large opacity-80">{{ stat.label }}</span>
      </Card>
    </div>

    <section aria-labelledby="overview-trends">
      <div class="section-header">
        <h2 id="overview-trends" class="text-title-medium">Last 4 weeks</h2>
        <span v-if="daily.data.value" class="pr-4 text-label-medium text-on-surface-variant"
          >Days in {{ daily.data.value.timeZone }}</span
        >
      </div>
      <Card
        :padded="false"
        as="p"
        v-if="daily.error.value"
        class="bg-surface-container! px-6 py-4 text-body-medium text-on-surface-variant"
      >
        Couldn't load the last 4 weeks: {{ daily.error.value }}
      </Card>
      <div v-else class="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-4">
        <TrendChart
          v-for="trend in TRENDS"
          :key="trend.metric"
          :label="trend.label"
          :icon="trend.icon"
          :loading="!daily.data.value"
          :daily="daily.data.value?.trends[trend.metric].daily"
          :dates="daily.data.value?.dates"
          :week="daily.data.value?.trends[trend.metric].week"
          :previous-week="daily.data.value?.trends[trend.metric].previousWeek"
        />
      </div>
    </section>

    <div class="grid items-start gap-6 expanded:grid-cols-2">
      <section v-if="staff" aria-labelledby="overview-activity">
        <div class="section-header">
          <h2 id="overview-activity" class="text-title-medium">Recent activity</h2>
          <LinkButton to="/audit">Full log</LinkButton>
        </div>
        <div
          :class="
            !activityLoading &&
            recent.length === 0 &&
            'overflow-hidden rounded-medium bg-surface-container'
          "
        >
          <StateBlock
            :loading="activityLoading"
            :error="activity.error.value"
            :empty="recent.length === 0"
            empty-text="No activity recorded."
            compact
          >
            <template #skeleton><SkeletonList two-line trailing="text" /></template>
            <List segmented>
              <ListItem
                v-for="{ entry, description } in recent"
                :key="entry.id"
                class="bg-surface-container!"
              >
                <template #leading>
                  <span
                    class="grid size-10 shrink-0 place-items-center rounded-full"
                    :class="toneContainerClass(description.tone)"
                    aria-hidden="true"
                  >
                    <span class="icon [--icon-size:20px]">{{ auditIcon(entry.action) }}</span>
                  </span>
                </template>
                <span class="block py-1">
                  <span :title="description.summary" class="block truncate text-body-large">
                    <AuditSummary :parts="description.parts" />
                  </span>
                  <span class="block text-body-medium text-on-surface-variant">{{
                    description.label
                  }}</span>
                </span>
                <template #trailing>
                  <span
                    class="shrink-0 self-start pt-1 text-label-small whitespace-nowrap text-on-surface-variant"
                    :title="absoluteTime(entry.createdAt)"
                    >{{ relativeTime(entry.createdAt) }}</span
                  >
                </template>
              </ListItem>
            </List>
          </StateBlock>
        </div>
      </section>

      <section
        v-if="staff && (!settings.loaded || hasTriageRole)"
        aria-labelledby="overview-triage"
      >
        <div class="section-header">
          <h2 id="overview-triage" class="text-title-medium">Waiting in triage</h2>
          <LinkButton to="/queue">View all</LinkButton>
        </div>
        <!-- Loading, empty and error states sit in one card in place of the list. -->
        <div
          :class="
            !pendingLoading &&
            (pending.data.value?.length ?? 0) === 0 &&
            'overflow-hidden rounded-medium bg-surface-container'
          "
        >
          <StateBlock
            :loading="pendingLoading"
            :error="pending.error.value"
            :empty="(pending.data.value?.length ?? 0) === 0"
            empty-text="Nobody is waiting."
            compact
          >
            <template #skeleton><SkeletonList trailing="text" /></template>
            <List segmented>
              <ListItem
                v-for="member in pending.data.value?.slice(0, 5)"
                :key="member.id"
                class="bg-surface-container!"
              >
                <template #leading>
                  <img
                    class="size-10 shrink-0 rounded-full bg-surface-container-highest object-cover"
                    :src="member.avatarUrl"
                    alt=""
                    width="40"
                    height="40"
                  />
                </template>
                <span
                  class="block truncate text-body-large"
                  :style="{ color: discordTextColor(member.color) }"
                  >{{ member.displayName }}</span
                >
                <template #trailing>
                  <span
                    class="shrink-0 text-label-small text-on-surface-variant"
                    :title="absoluteTime(member.joinedAt)"
                    >{{ relativeTime(member.joinedAt) }}</span
                  >
                </template>
              </ListItem>
            </List>
          </StateBlock>
        </div>
      </section>

      <section aria-labelledby="overview-games">
        <div class="section-header">
          <h2 id="overview-games" class="text-title-medium">Top games this week</h2>
          <LinkButton to="/activity">View all</LinkButton>
        </div>
        <div
          :class="
            !playLoading &&
            topGames.length === 0 &&
            'overflow-hidden rounded-medium bg-surface-container'
          "
        >
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
            <List segmented>
              <ListItem
                v-for="(game, index) in topGames"
                :key="game.name"
                :as="RouterLink"
                :to="{ path: '/activity', query: { game: game.name } }"
                class="bg-surface-container!"
              >
                <template #leading>
                  <span class="flex items-center gap-4">
                    <span
                      class="w-7 shrink-0 text-center text-label-large tabular-nums"
                      :class="rankClass(index)"
                      >#{{ index + 1 }}</span
                    >
                    <img
                      v-if="game.iconUrl"
                      class="size-10 shrink-0 rounded-small bg-surface-container-highest object-cover"
                      :src="game.iconUrl"
                      alt=""
                      width="40"
                      height="40"
                    />
                    <span
                      v-else
                      class="grid size-10 shrink-0 place-items-center rounded-small bg-surface-container-highest text-on-surface-variant"
                      aria-hidden="true"
                      ><span class="icon [--icon-size:20px]">sports_esports</span></span
                    >
                  </span>
                </template>
                <span class="block py-1">
                  <span :title="game.name" class="block truncate text-body-large">{{
                    game.name
                  }}</span>
                  <span
                    :title="game.top.map((player) => player.displayName).join(', ')"
                    class="block truncate text-body-small text-on-surface-variant"
                  >
                    {{ playerNames(game) }}
                  </span>
                </span>
                <template #trailing>
                  <span class="shrink-0 text-body-large tabular-nums">{{
                    formatDuration(game.ms)
                  }}</span>
                </template>
              </ListItem>
            </List>
          </StateBlock>
        </div>
      </section>

      <section aria-labelledby="overview-tracks">
        <div class="section-header">
          <h2 id="overview-tracks" class="text-title-medium">Top tracks this week</h2>
          <LinkButton to="/activity">View all</LinkButton>
        </div>
        <div
          :class="
            !playLoading &&
            topTracks.length === 0 &&
            'overflow-hidden rounded-medium bg-surface-container'
          "
        >
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
            <List segmented>
              <ListItem
                v-for="(track, index) in topTracks"
                :key="track.id"
                :as="RouterLink"
                :to="{ path: '/activity', query: { track: track.id } }"
                class="bg-surface-container!"
              >
                <template #leading>
                  <span class="flex items-center gap-4">
                    <span
                      class="w-7 shrink-0 text-center text-label-large tabular-nums"
                      :class="rankClass(index)"
                      >#{{ index + 1 }}</span
                    >
                    <img
                      v-if="track.artUrl"
                      class="size-10 shrink-0 rounded-small bg-surface-container-highest object-cover"
                      :src="track.artUrl"
                      :alt="track.album ?? ''"
                      width="40"
                      height="40"
                    />
                    <span
                      v-else
                      class="grid size-10 shrink-0 place-items-center rounded-small bg-surface-container-highest text-on-surface-variant"
                      aria-hidden="true"
                      ><span class="icon [--icon-size:20px]">music_note</span></span
                    >
                  </span>
                </template>
                <span class="block py-1">
                  <span :title="track.title" class="block truncate text-body-large">{{
                    track.title
                  }}</span>
                  <span class="block truncate text-body-small text-on-surface-variant">
                    {{ track.artist ?? 'Unknown artist' }}
                  </span>
                </span>
                <template #trailing>
                  <span class="shrink-0 text-body-large tabular-nums">{{
                    track.plays === 1 ? '1 play' : `${track.plays.toLocaleString()} plays`
                  }}</span>
                </template>
              </ListItem>
            </List>
          </StateBlock>
        </div>
      </section>

      <section aria-labelledby="overview-voice">
        <div class="section-header">
          <h2 id="overview-voice" class="text-title-medium">Most time in voice this week</h2>
          <LinkButton to="/voice">View all</LinkButton>
        </div>
        <div
          :class="
            !voiceLoading &&
            topVoice.length === 0 &&
            'overflow-hidden rounded-medium bg-surface-container'
          "
        >
          <StateBlock
            :loading="voiceLoading"
            :error="voice.error.value"
            :empty="topVoice.length === 0"
            empty-text="Nobody spent time in voice this week."
            compact
          >
            <template #skeleton><SkeletonList rank two-line trailing="stack" /></template>
            <List segmented>
              <ListItem
                v-for="(member, index) in topVoice"
                :key="member.id"
                :as="RouterLink"
                :to="{ path: '/voice', query: { member: member.id } }"
                class="bg-surface-container!"
              >
                <template #leading>
                  <span class="flex items-center gap-4">
                    <span
                      class="w-7 shrink-0 text-center text-label-large tabular-nums"
                      :class="rankClass(index)"
                      >#{{ index + 1 }}</span
                    >
                    <img
                      class="size-10 shrink-0 rounded-full bg-surface-container-highest object-cover"
                      :src="member.avatarUrl"
                      alt=""
                      width="40"
                      height="40"
                    />
                  </span>
                </template>
                <span class="block py-1">
                  <span
                    :style="{ color: discordTextColor(member.color) }"
                    class="block truncate text-body-large"
                  >
                    {{ member.displayName }}
                  </span>
                  <span class="block truncate text-body-small text-on-surface-variant">
                    {{
                      member.sessions === 1
                        ? '1 session'
                        : `${member.sessions.toLocaleString()} sessions`
                    }}
                  </span>
                </span>
                <template #trailing>
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
                </template>
              </ListItem>
            </List>
          </StateBlock>
        </div>
      </section>

      <section aria-labelledby="overview-channels">
        <div class="section-header">
          <h2 id="overview-channels" class="text-title-medium">Busiest voice channels this week</h2>
          <LinkButton to="/voice">View all</LinkButton>
        </div>
        <div
          :class="
            !voiceLoading &&
            topChannels.length === 0 &&
            'overflow-hidden rounded-medium bg-surface-container'
          "
        >
          <StateBlock
            :loading="voiceLoading"
            :error="voice.error.value"
            :empty="topChannels.length === 0"
            empty-text="No voice channels used this week."
            compact
          >
            <template #skeleton><SkeletonList rank two-line trailing="stack" /></template>
            <List segmented>
              <ListItem
                v-for="(channel, index) in topChannels"
                :key="channel.id"
                class="bg-surface-container!"
              >
                <template #leading>
                  <span class="flex items-center gap-4">
                    <span
                      class="w-7 shrink-0 text-center text-label-large tabular-nums"
                      :class="rankClass(index)"
                      >#{{ index + 1 }}</span
                    >
                    <span
                      class="grid size-10 shrink-0 place-items-center rounded-small bg-surface-container-highest text-on-surface-variant"
                      aria-hidden="true"
                      ><span class="icon [--icon-size:20px]">volume_up</span></span
                    >
                  </span>
                </template>
                <span class="block py-1">
                  <span :title="channel.name" class="block truncate text-body-large">{{
                    channel.name
                  }}</span>
                  <span class="block truncate text-body-small text-on-surface-variant">
                    {{
                      channel.members === 1
                        ? '1 member'
                        : `${channel.members.toLocaleString()} members`
                    }}
                  </span>
                </span>
                <template #trailing>
                  <div class="flex shrink-0 flex-col items-end">
                    <span class="text-body-large tabular-nums">{{
                      formatDuration(channel.ms)
                    }}</span>
                    <span class="text-label-small text-on-surface-variant">Active</span>
                  </div>
                </template>
              </ListItem>
            </List>
          </StateBlock>
        </div>
      </section>

      <section aria-labelledby="overview-birthdays">
        <div class="section-header">
          <h2 id="overview-birthdays" class="text-title-medium">Upcoming birthdays</h2>
          <LinkButton v-if="staff" to="/birthdays">View all</LinkButton>
        </div>
        <div
          :class="
            !upcomingLoading &&
            birthdays.length === 0 &&
            'overflow-hidden rounded-medium bg-surface-container'
          "
        >
          <StateBlock
            :loading="upcomingLoading"
            :error="upcoming.error.value"
            :empty="birthdays.length === 0"
            empty-text="No birthdays in the next 30 days."
            compact
          >
            <template #skeleton><SkeletonList two-line trailing="stack" /></template>
            <List segmented>
              <ListItem v-for="entry in birthdays" :key="entry.id" class="bg-surface-container!">
                <template #leading>
                  <img
                    class="size-10 shrink-0 rounded-full bg-surface-container-highest object-cover"
                    :src="entry.avatarUrl"
                    alt=""
                    width="40"
                    height="40"
                  />
                </template>
                <span class="block py-1">
                  <span
                    :style="{ color: discordTextColor(entry.color) }"
                    class="block truncate text-body-large"
                  >
                    {{ entry.displayName }}
                  </span>
                  <span class="block truncate font-mono text-body-small text-on-surface-variant">
                    {{ entry.username }}
                  </span>
                </span>
                <template #trailing>
                  <div class="flex shrink-0 flex-col items-end">
                    <span class="text-body-large">{{
                      formatMonthDay(entry.month, entry.day)
                    }}</span>
                    <span
                      class="text-label-small"
                      :class="entry.daysUntil === 0 ? 'text-tertiary' : 'text-on-surface-variant'"
                      >{{ formatUntil(entry.daysUntil) }}</span
                    >
                  </div>
                </template>
              </ListItem>
            </List>
          </StateBlock>
        </div>
      </section>
    </div>
  </div>
</template>
