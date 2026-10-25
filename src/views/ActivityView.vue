<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import FilterChip from '@/components/FilterChip.vue'
import StateBlock from '@/components/StateBlock.vue'
import { apiFetch } from '@/lib/api'
import { discordTextColor } from '@/lib/discord'
import { absoluteTime, formatDuration, relativeTime } from '@/lib/format'
import { useAsync } from '@/lib/useAsync'

type ActivityMember = {
  id: string
  username: string
  displayName: string
  /** Their name's colour in Discord (highest coloured role); #000000 for none. */
  color?: string
  avatarUrl: string
}

type Track = {
  id: string
  title: string
  artist: string | null
  album: string | null
  artUrl: string | null
}

type ActivityOverview = {
  days: number
  totals: { gameMs: number; games: number; trackPlays: number; tracks: number }
  games: { name: string; ms: number; players: number; top: (ActivityMember & { ms: number })[] }[]
  tracks: (Track & {
    plays: number
    listeners: number
    ms: number
    top: (ActivityMember & { plays: number })[]
  })[]
  playing: { member: ActivityMember; game: string; since: number }[]
  listening: { member: ActivityMember; track: Track; since: number }[]
}

const PERIODS = [
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
]

const route = useRoute()
const router = useRouter()

function daysFromQuery(): number {
  const days = Number(route.query.days)
  return PERIODS.some((period) => period.days === days) ? days : 7
}

const days = ref(daysFromQuery())
const overview = useAsync(() => apiFetch<ActivityOverview>(`/api/activity?days=${days.value}`))

onMounted(() => void overview.run())

watch(days, (value) => {
  void router.replace({ query: { ...route.query, days: value === 7 ? undefined : String(value) } })
  void overview.run()
})

const data = computed(() => overview.data.value)
const games = computed(() => data.value?.games ?? [])
const tracks = computed(() => data.value?.tracks ?? [])

/** Who is playing and listening right now, games first. */
const live = computed(() => [
  ...(data.value?.playing ?? []).map((entry) => ({
    key: `game:${entry.member.id}:${entry.game}`,
    member: entry.member,
    icon: 'sports_esports',
    title: entry.game,
    subtitle: null as string | null,
    since: entry.since,
  })),
  ...(data.value?.listening ?? []).map((entry) => ({
    key: `track:${entry.member.id}`,
    member: entry.member,
    icon: 'music_note',
    title: entry.track.title,
    subtitle: entry.track.artist,
    since: entry.since,
  })),
])

const hours = (ms: number) =>
  (ms / 3_600_000).toLocaleString('en', { maximumFractionDigits: ms < 36_000_000 ? 1 : 0 })

/** Each tile takes a different tonal container, as on Overview. */
const stats = computed(() => {
  const totals = data.value?.totals
  return [
    {
      label: 'Hours played',
      value: totals ? hours(totals.gameMs) : '—',
      tone: 'bg-primary-container text-on-primary-container',
    },
    {
      label: totals?.games === 1 ? 'Game played' : 'Games played',
      value: totals?.games ?? '—',
      tone: 'bg-secondary-container text-on-secondary-container',
    },
    {
      label: 'Spotify plays',
      value: totals?.trackPlays.toLocaleString() ?? '—',
      tone: 'bg-tertiary-container text-on-tertiary-container',
    },
  ]
})

const plural = (count: number, one: string, many: string) =>
  `${count.toLocaleString()} ${count === 1 ? one : many}`
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap gap-2" role="group" aria-label="Period">
      <FilterChip
        v-for="period in PERIODS"
        :key="period.days"
        :label="period.label"
        :model-value="days === period.days"
        @update:model-value="days = period.days"
      />
    </div>

    <div class="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-4">
      <div
        v-for="stat in stats"
        :key="stat.label"
        class="card flex flex-col gap-1 px-6 py-5"
        :class="stat.tone"
      >
        <span class="text-display-small font-medium">{{ stat.value }}</span>
        <span class="text-label-large opacity-80">{{ stat.label }}</span>
      </div>
    </div>

    <section aria-labelledby="activity-live">
      <div class="section-header">
        <div>
          <h2 id="activity-live" class="text-title-medium">Right now</h2>
          <p class="text-body-medium text-on-surface-variant">
            From members' Discord status. Members who hide their activity aren't counted.
          </p>
        </div>
        <span v-if="live.length > 0" class="pr-4 text-label-large text-on-surface-variant">{{
          live.length
        }}</span>
      </div>
      <div :class="live.length === 0 && 'card'">
        <StateBlock
          :loading="overview.loading.value && !data"
          :error="overview.error.value"
          :empty="live.length === 0"
          empty-text="Nobody is playing or listening right now."
          compact
        >
          <ul class="segmented-list">
            <li v-for="entry in live" :key="entry.key" class="segmented-item">
              <img
                class="size-10 shrink-0 rounded-full bg-surface-container-highest object-cover"
                :src="entry.member.avatarUrl"
                alt=""
                width="40"
                height="40"
              />
              <div class="min-w-0 flex-1 py-1">
                <p
                  class="truncate text-body-large"
                  :style="{ color: discordTextColor(entry.member.color) }"
                >
                  {{ entry.member.displayName }}
                </p>
                <p class="flex items-center gap-1.5 text-body-medium text-on-surface-variant">
                  <span class="shrink-0 icon [--icon-size:16px]" aria-hidden="true">{{
                    entry.icon
                  }}</span>
                  <span class="truncate"
                    >{{ entry.title
                    }}<template v-if="entry.subtitle"> · {{ entry.subtitle }}</template></span
                  >
                </p>
              </div>
              <span
                class="shrink-0 self-start pt-1 text-label-small whitespace-nowrap text-on-surface-variant"
                :title="`Since ${absoluteTime(entry.since)}`"
                >{{ relativeTime(entry.since) }}</span
              >
            </li>
          </ul>
        </StateBlock>
      </div>
    </section>

    <div class="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] items-start gap-6">
      <section aria-labelledby="activity-games">
        <div class="section-header">
          <div>
            <h2 id="activity-games" class="text-title-medium">Most played games</h2>
            <p class="text-body-medium text-on-surface-variant">
              By hours played. Sessions under a minute aren't counted.
            </p>
          </div>
        </div>
        <div :class="games.length === 0 && 'card'">
          <StateBlock
            :loading="overview.loading.value && !data"
            :error="overview.error.value"
            :empty="games.length === 0"
            empty-text="No games played in this period."
            compact
          >
            <ol class="segmented-list">
              <li v-for="(game, index) in games" :key="game.name" class="segmented-item">
                <span
                  class="grid size-10 shrink-0 place-items-center rounded-full text-title-small"
                  :class="
                    index === 0
                      ? 'bg-primary-container text-on-primary-container'
                      : 'bg-surface-container-highest text-on-surface-variant'
                  "
                  >{{ index + 1 }}</span
                >
                <div class="min-w-0 flex-1 py-1">
                  <p class="truncate text-body-large" :title="game.name">{{ game.name }}</p>
                  <div class="flex items-center gap-2">
                    <span class="flex -space-x-1.5">
                      <img
                        v-for="player in game.top"
                        :key="player.id"
                        class="size-5 rounded-full bg-surface-container-highest object-cover ring-2 ring-surface-container"
                        :src="player.avatarUrl"
                        :alt="player.displayName"
                        :title="`${player.displayName} · ${formatDuration(player.ms)}`"
                        width="20"
                        height="20"
                      />
                    </span>
                    <span class="truncate text-body-small text-on-surface-variant">{{
                      plural(game.players, 'player', 'players')
                    }}</span>
                  </div>
                </div>
                <span class="shrink-0 text-body-large tabular-nums">{{
                  formatDuration(game.ms)
                }}</span>
              </li>
            </ol>
          </StateBlock>
        </div>
      </section>

      <section aria-labelledby="activity-tracks">
        <div class="section-header">
          <div>
            <h2 id="activity-tracks" class="text-title-medium">Most played on Spotify</h2>
            <p class="text-body-medium text-on-surface-variant">
              By plays. A play is 30 seconds or more, as Spotify counts them.
            </p>
          </div>
        </div>
        <div :class="tracks.length === 0 && 'card'">
          <StateBlock
            :loading="overview.loading.value && !data"
            :error="overview.error.value"
            :empty="tracks.length === 0"
            empty-text="No Spotify tracks played in this period."
            compact
          >
            <ol class="segmented-list">
              <li v-for="track in tracks" :key="track.id" class="segmented-item">
                <img
                  v-if="track.artUrl"
                  class="size-10 shrink-0 rounded-sm bg-surface-container-highest object-cover"
                  :src="track.artUrl"
                  :alt="track.album ?? ''"
                  :title="track.album ?? undefined"
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
                  <a
                    class="block truncate text-body-large hover:underline"
                    :href="`https://open.spotify.com/track/${track.id}`"
                    target="_blank"
                    rel="noopener noreferrer"
                    :title="track.title"
                    >{{ track.title }}</a
                  >
                  <p class="truncate text-body-small text-on-surface-variant">
                    {{ track.artist ?? 'Unknown artist' }}
                  </p>
                </div>
                <div class="flex shrink-0 flex-col items-end">
                  <span class="text-body-large tabular-nums">{{
                    plural(track.plays, 'play', 'plays')
                  }}</span>
                  <span
                    class="text-label-small text-on-surface-variant"
                    :title="
                      track.top
                        .map((listener) => `${listener.displayName} (${listener.plays})`)
                        .join(', ')
                    "
                    >{{ plural(track.listeners, 'listener', 'listeners') }}</span
                  >
                </div>
              </li>
            </ol>
          </StateBlock>
        </div>
      </section>
    </div>
  </div>
</template>
