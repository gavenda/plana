<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import FilterChip from '@/components/FilterChip.vue'
import RichTooltip from '@/components/RichTooltip.vue'
import SupportingSheet from '@/components/SupportingSheet.vue'
import SkeletonList from '@/components/SkeletonList.vue'
import StateBlock from '@/components/StateBlock.vue'
import type { ActivityOverview, GamePlayers, TrackListeners } from '@/lib/activity'
import { apiFetch } from '@/lib/api'
import { discordTextColor } from '@/lib/discord'
import { absoluteTime, formatDuration, relativeTime } from '@/lib/format'
import { useLive } from '@/lib/live'
import { rankClass } from '@/lib/rank'
import { useAsync } from '@/lib/useAsync'
import { useSessionStore } from '@/stores/session'

/** `days` null is all time; in the URL and the API it is `all`. */
const PERIODS: { days: number | null; label: string }[] = [
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
  { days: null, label: 'All time' },
]
const DEFAULT_DAYS = 7

const daysParam = (days: number | null) => (days == null ? 'all' : String(days))

const route = useRoute()
const router = useRouter()
const session = useSessionStore()

function daysFromQuery(): number | null {
  const raw = route.query.days
  if (raw === 'all') return null
  const days = Number(raw)
  return PERIODS.some((period) => period.days === days) ? days : DEFAULT_DAYS
}

const days = ref(daysFromQuery())
const overview = useAsync(() =>
  apiFetch<ActivityOverview>(`/api/activity?days=${daysParam(days.value)}`),
)

onMounted(() => void overview.run())

/** "Right now" follows along; the totals wait for a change of period or a reload. */
useLive('presence', (message) => {
  if (!overview.data.value) return
  if (message) overview.data.value = { ...overview.data.value, ...message }
  else void overview.run()
})

watch(days, (value) => {
  void router.replace({
    query: { ...route.query, days: value === DEFAULT_DAYS ? undefined : daysParam(value) },
  })
  void overview.run()
})

const data = computed(() => overview.data.value)
/** Nothing to show yet; a change of period keeps the last answer up until the next lands. */
const loading = computed(() => !data.value && !overview.error.value)
const games = computed(() => data.value?.games ?? [])
const tracks = computed(() => data.value?.tracks ?? [])

/** Who is playing and listening right now, games first. */
const live = computed(() => [
  ...(data.value?.playing ?? []).map((entry) => ({
    key: `game:${entry.member.id}:${entry.game}`,
    member: entry.member,
    icon: 'sports_esports',
    image: entry.iconUrl,
    title: entry.game,
    subtitle: null as string | null,
    since: entry.since,
  })),
  ...(data.value?.listening ?? []).map((entry) => ({
    key: `track:${entry.member.id}`,
    member: entry.member,
    icon: 'music_note',
    image: entry.track.artUrl,
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

/** The game whose players the supporting sheet shows. It lives in the URL, so a link opens it. */
const chosenGame = computed(() =>
  typeof route.query.game === 'string' && route.query.game ? route.query.game : null,
)

/** The name stays while the sheet animates closed. */
const sheetGame = ref(chosenGame.value)
watch(chosenGame, (game) => {
  if (game) sheetGame.value = game
})

const sheetOpen = computed({
  get: () => chosenGame.value != null,
  set: (open) => {
    if (!open) closeGame()
  },
})

/** Whether opening the sheet pushed a history entry, so closing it can pop that instead. */
let pushedChoice = false

// Leaving by the browser's own Back leaves nothing to pop.
watch(chosenGame, (game) => {
  if (!game) pushedChoice = false
})

/** Opening is a step Back undoes; switching games while open just swaps what it shows. */
function chooseGame(name: string) {
  const query = { ...route.query, game: name, track: undefined }
  if (chosenGame.value || chosenTrack.value) {
    void router.replace({ query })
  } else {
    pushedChoice = true
    void router.push({ query })
  }
}

function closeGame() {
  if (pushedChoice) {
    pushedChoice = false
    router.back()
  } else {
    void router.replace({ query: { ...route.query, game: undefined } })
  }
}

const gamePlayers = useAsync(() => {
  const query = new URLSearchParams({ name: chosenGame.value ?? '', days: daysParam(days.value) })
  return apiFetch<GamePlayers>(`/api/activity/game?${query}`)
})

watch([chosenGame, days], () => {
  if (chosenGame.value) void gamePlayers.run()
})

onMounted(() => {
  if (chosenGame.value) void gamePlayers.run()
})

/** The track whose listeners the second sheet shows; like the game, it lives in the URL. */
const chosenTrack = computed(() =>
  typeof route.query.track === 'string' && route.query.track ? route.query.track : null,
)

/** The id stays while the sheet animates closed. */
const sheetTrackId = ref(chosenTrack.value)
watch(chosenTrack, (id) => {
  if (id) sheetTrackId.value = id
})

const trackSheetOpen = computed({
  get: () => chosenTrack.value != null,
  set: (open) => {
    if (!open) closeTrack()
  },
})

let pushedTrackChoice = false

watch(chosenTrack, (id) => {
  if (!id) pushedTrackChoice = false
})

function chooseTrack(id: string) {
  const query = { ...route.query, track: id, game: undefined }
  if (chosenTrack.value || chosenGame.value) {
    void router.replace({ query })
  } else {
    pushedTrackChoice = true
    void router.push({ query })
  }
}

function closeTrack() {
  if (pushedTrackChoice) {
    pushedTrackChoice = false
    router.back()
  } else {
    void router.replace({ query: { ...route.query, track: undefined } })
  }
}

const trackListeners = useAsync(() => {
  const query = new URLSearchParams({ id: chosenTrack.value ?? '', days: daysParam(days.value) })
  return apiFetch<TrackListeners>(`/api/activity/track?${query}`)
})

watch([chosenTrack, days], () => {
  if (chosenTrack.value) void trackListeners.run()
})

onMounted(() => {
  if (chosenTrack.value) void trackListeners.run()
})

/** The overview's row for the track, which already has its title and art before the answer lands. */
const sheetTrack = computed(
  () =>
    trackDetail.value?.track ??
    tracks.value.find((track) => track.id === sheetTrackId.value) ??
    null,
)

/** The answer for the track in the sheet only. */
const trackDetail = computed(() =>
  trackListeners.data.value?.id === sheetTrackId.value ? trackListeners.data.value : null,
)

/** The answer for the game in the sheet only, so a slow earlier one never shows under a later name. */
const detail = computed(() =>
  gamePlayers.data.value?.name === sheetGame.value ? gamePlayers.data.value : null,
)

const sheetIcon = computed(
  () =>
    detail.value?.iconUrl ??
    games.value.find((game) => game.name === sheetGame.value)?.iconUrl ??
    null,
)

const periodLabel = computed(() => PERIODS.find((period) => period.days === days.value)?.label)

/** The track's page on Spotify; a presence's sync id is its Spotify track id. */
const spotifyUrl = (id: string) => `https://open.spotify.com/track/${id}`

const plural = (count: number, one: string, many: string) =>
  `${count.toLocaleString()} ${count === 1 ? one : many}`
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex items-start gap-4">
      <div class="flex flex-1 flex-wrap gap-2" role="group" aria-label="Period">
        <FilterChip
          v-for="period in PERIODS"
          :key="period.label"
          :label="period.label"
          :model-value="days === period.days"
          @update:model-value="days = period.days"
        />
      </div>
      <RouterLink v-if="session.isAdmin" to="/activity/game-nights" class="btn btn-tonal btn-wide">
        <span class="icon [--icon-size:18px]" aria-hidden="true">celebration</span>
        Game nights
      </RouterLink>
    </div>

    <div class="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-4">
      <div
        v-for="stat in stats"
        :key="stat.label"
        class="card flex flex-col gap-1 px-6 py-5"
        :class="stat.tone"
      >
        <span class="text-display-small font-medium">
          <span v-if="loading" class="skeleton inline-block h-[0.8em] w-[1.6em] align-middle" />
          <template v-else>{{ stat.value }}</template>
        </span>
        <span class="text-label-large opacity-80">{{ stat.label }}</span>
      </div>
    </div>

    <section aria-labelledby="activity-live">
      <div class="section-header">
        <h2 id="activity-live" class="text-title-medium">Right now</h2>
        <span v-if="live.length > 0" class="pr-4 text-label-large text-on-surface-variant">{{
          live.length
        }}</span>
      </div>
      <div :class="!loading && live.length === 0 && 'card'">
        <StateBlock
          :loading="loading"
          :error="overview.error.value"
          :empty="live.length === 0"
          empty-text="Nobody is playing or listening right now."
          compact
        >
          <template #skeleton><SkeletonList :rows="2" two-line trailing="text" /></template>
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
                  <img
                    v-if="entry.image"
                    class="size-4 shrink-0 rounded-xs object-cover"
                    :src="entry.image"
                    alt=""
                    width="16"
                    height="16"
                  />
                  <span v-else class="shrink-0 icon [--icon-size:16px]" aria-hidden="true">{{
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

    <!-- Two columns from the expanded class however narrow a docked sheet makes them, so opening
         a game never moves Spotify. -->
    <div class="grid items-start gap-6 expanded:grid-cols-2">
      <section aria-labelledby="activity-games">
        <div class="section-header">
          <h2 id="activity-games" class="text-title-medium">Most played games</h2>
        </div>
        <div :class="!loading && games.length === 0 && 'card'">
          <StateBlock
            :loading="loading"
            :error="overview.error.value"
            :empty="games.length === 0"
            empty-text="No games played in this period."
            compact
          >
            <template #skeleton>
              <SkeletonList :rows="5" leading="art" rank two-line trailing="text" />
            </template>
            <ol class="segmented-list">
              <li v-for="(game, index) in games" :key="game.name" class="segmented-item p-0">
                <button
                  type="button"
                  class="state-layer flex min-h-14 w-full min-w-0 cursor-pointer items-center gap-4 rounded-[inherit] px-4 py-2 text-left transition-colors duration-200 ease-effects-fast"
                  :class="
                    game.name === chosenGame && 'bg-secondary-container text-on-secondary-container'
                  "
                  :aria-current="game.name === chosenGame ? 'true' : undefined"
                  @click="chooseGame(game.name)"
                >
                  <span
                    class="w-7 shrink-0 text-center text-label-large tabular-nums"
                    :class="rankClass(index)"
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
                    <!-- As tall as a line of body-small (16px), like a track's artist line, so
                         both lists' rows match; the 20px avatars overhang it by 2px each way. -->
                    <div class="flex h-4 items-center gap-2">
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
                </button>
              </li>
            </ol>
          </StateBlock>
        </div>
      </section>

      <section aria-labelledby="activity-tracks">
        <div class="section-header">
          <h2 id="activity-tracks" class="text-title-medium">Most played on Spotify</h2>
        </div>
        <div :class="!loading && tracks.length === 0 && 'card'">
          <StateBlock
            :loading="loading"
            :error="overview.error.value"
            :empty="tracks.length === 0"
            empty-text="No Spotify tracks played in this period."
            compact
          >
            <template #skeleton>
              <SkeletonList :rows="5" leading="art" rank two-line trailing="stack" />
            </template>
            <ol class="segmented-list">
              <li
                v-for="(track, index) in tracks"
                :key="track.id"
                class="segmented-item state-layer gap-2 p-0 pr-4 transition-colors duration-200 ease-effects-fast"
                :class="
                  track.id === chosenTrack && 'bg-secondary-container text-on-secondary-container'
                "
              >
                <button
                  type="button"
                  class="flex min-h-14 min-w-0 flex-1 cursor-pointer items-center gap-4 rounded-[inherit] px-4 py-2 text-left"
                  :aria-current="track.id === chosenTrack ? 'true' : undefined"
                  @click="chooseTrack(track.id)"
                >
                  <span
                    class="w-7 shrink-0 text-center text-label-large tabular-nums"
                    :class="rankClass(index)"
                    >#{{ index + 1 }}</span
                  >
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
                    <p class="truncate text-body-large" :title="track.title">{{ track.title }}</p>
                    <p class="truncate text-body-small text-on-surface-variant">
                      {{ track.artist ?? 'Unknown artist' }}
                    </p>
                  </div>
                  <div class="flex shrink-0 flex-col items-end">
                    <span class="text-body-large tabular-nums">{{
                      plural(track.plays, 'play', 'plays')
                    }}</span>
                    <span class="text-label-small text-on-surface-variant">{{
                      plural(track.listeners, 'listener', 'listeners')
                    }}</span>
                  </div>
                </button>
                <RichTooltip
                  title="Open in Spotify"
                  :href="spotifyUrl(track.id)"
                  icon="open_in_new"
                  narrow
                />
              </li>
            </ol>
          </StateBlock>
        </div>
      </section>
    </div>

    <SupportingSheet v-model:open="sheetOpen" :headline="sheetGame ?? ''">
      <template #leading>
        <img
          v-if="sheetIcon"
          class="size-14 shrink-0 rounded-md bg-surface-container-highest object-cover"
          :src="sheetIcon"
          alt=""
          width="56"
          height="56"
        />
        <span
          v-else
          class="grid size-14 shrink-0 place-items-center rounded-md bg-surface-container-highest text-on-surface-variant"
          aria-hidden="true"
          ><span class="icon">sports_esports</span></span
        >
      </template>
      <template v-if="detail" #supporting>
        {{ formatDuration(detail.ms) }} · {{ plural(detail.players.length, 'player', 'players') }} ·
        {{ periodLabel }}
      </template>
      <StateBlock
        :loading="gamePlayers.loading.value && !detail"
        :error="gamePlayers.error.value"
        :empty="detail?.players.length === 0"
        empty-text="Nobody played this in this period."
        compact
      >
        <template #skeleton>
          <SkeletonList
            :rows="4"
            rank
            two-line
            trailing="text"
            item-class="bg-surface-container-high"
          />
        </template>
        <ol class="segmented-list">
          <li
            v-for="(player, index) in detail?.players"
            :key="player.id"
            class="segmented-item bg-surface-container-high"
          >
            <span
              class="w-7 shrink-0 text-center text-label-large tabular-nums"
              :class="rankClass(index)"
              >#{{ index + 1 }}</span
            >
            <img
              class="size-10 shrink-0 rounded-full bg-surface-container-highest object-cover"
              :src="player.avatarUrl"
              alt=""
              width="40"
              height="40"
            />
            <div class="min-w-0 flex-1 py-1">
              <p
                class="truncate text-body-large"
                :style="{ color: discordTextColor(player.color) }"
              >
                {{ player.displayName }}
              </p>
              <p class="truncate font-mono text-body-small text-on-surface-variant">
                {{ player.username }}
              </p>
            </div>
            <div class="flex shrink-0 flex-col items-end">
              <span class="text-body-large tabular-nums">{{ formatDuration(player.ms) }}</span>
              <span
                v-if="player.playingSince != null"
                class="text-label-small text-tertiary"
                :title="`Since ${absoluteTime(player.playingSince)}`"
                >Playing now</span
              >
            </div>
          </li>
        </ol>
      </StateBlock>
    </SupportingSheet>

    <SupportingSheet v-model:open="trackSheetOpen" :headline="sheetTrack?.title ?? ''">
      <template #leading>
        <img
          v-if="sheetTrack?.artUrl"
          class="size-14 shrink-0 rounded-md bg-surface-container-highest object-cover"
          :src="sheetTrack.artUrl"
          alt=""
          width="56"
          height="56"
        />
        <span
          v-else
          class="grid size-14 shrink-0 place-items-center rounded-md bg-surface-container-highest text-on-surface-variant"
          aria-hidden="true"
          ><span class="icon">music_note</span></span
        >
      </template>
      <template v-if="trackDetail" #supporting>
        {{ plural(trackDetail.plays, 'play', 'plays') }} ·
        {{ plural(trackDetail.listeners.length, 'listener', 'listeners') }} · {{ periodLabel }}
      </template>
      <StateBlock
        :loading="trackListeners.loading.value && !trackDetail"
        :error="trackListeners.error.value"
        :empty="trackDetail?.listeners.length === 0"
        empty-text="Nobody played this in this period."
        compact
      >
        <template #skeleton>
          <SkeletonList
            :rows="4"
            rank
            two-line
            trailing="text"
            item-class="bg-surface-container-high"
          />
        </template>
        <ol class="segmented-list">
          <li
            v-for="(listener, index) in trackDetail?.listeners"
            :key="listener.id"
            class="segmented-item bg-surface-container-high"
          >
            <span
              class="w-7 shrink-0 text-center text-label-large tabular-nums"
              :class="rankClass(index)"
              >#{{ index + 1 }}</span
            >
            <img
              class="size-10 shrink-0 rounded-full bg-surface-container-highest object-cover"
              :src="listener.avatarUrl"
              alt=""
              width="40"
              height="40"
            />
            <div class="min-w-0 flex-1 py-1">
              <p
                class="truncate text-body-large"
                :style="{ color: discordTextColor(listener.color) }"
              >
                {{ listener.displayName }}
              </p>
              <p class="truncate font-mono text-body-small text-on-surface-variant">
                {{ listener.username }}
              </p>
            </div>
            <div class="flex shrink-0 flex-col items-end">
              <span class="text-body-large tabular-nums">{{
                plural(listener.plays, 'play', 'plays')
              }}</span>
              <span
                v-if="listener.listeningSince != null"
                class="text-label-small text-tertiary"
                :title="`Since ${absoluteTime(listener.listeningSince)}`"
                >Listening now</span
              >
            </div>
          </li>
        </ol>
      </StateBlock>
    </SupportingSheet>
  </div>
</template>
