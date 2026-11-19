<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button, Card, List, ListItem } from 'tailwind-material3'

import LinkButton from '@/components/LinkButton.vue'
import ActivityHeatmap from '@/components/ActivityHeatmap.vue'
import PeriodChips from '@/components/PeriodChips.vue'
import RichTooltip from '@/components/RichTooltip.vue'
import SupportingSheet from '@/components/SupportingSheet.vue'
import SkeletonList from '@/components/SkeletonList.vue'
import StateBlock from '@/components/StateBlock.vue'
import TopItemCard from '@/components/TopItemCard.vue'
import TrendChart from '@/components/TrendChart.vue'
import {
  busiestHour,
  type ActivityMember,
  type ActivityOverview,
  type DailyTrends,
  type GamePlayers,
  type Heatmap,
} from '@/lib/activity'
import { apiFetch } from '@/lib/api'
import { discordTextColor } from '@/lib/discord'
import { absoluteTime, formatDuration, relativeTime } from '@/lib/format'
import { useLive } from '@/lib/live'
import { plural, usePeriod } from '@/lib/period'
import { rankClass } from '@/lib/rank'
import { useAsync } from '@/lib/useAsync'
import { useSessionStore } from '@/stores/session'

/** What members play, from their Discord presence. Listening is on the Music page. */

const route = useRoute()
const router = useRouter()
const session = useSessionStore()
const { days, param, label: periodLabel } = usePeriod()

const overview = useAsync(() => apiFetch<ActivityOverview>(`/api/activity?days=${param.value}`))
/** Averages over weeks barely move with one play, so the heatmap follows the period only. */
const heatmap = useAsync(() =>
  apiFetch<Heatmap>(`/api/activity/heatmap?kind=games&days=${param.value}`),
)

/** The last 4 weeks, day by day, whatever the period; the same answer Overview's charts use. */
const daily = useAsync(() => apiFetch<DailyTrends>('/api/activity/daily'))

function load() {
  void overview.run()
  void heatmap.run()
}

onMounted(() => {
  load()
  void daily.run()
})
watch(days, load)

/** "Right now" follows along; the totals wait for a change of period or a reload. */
useLive('presence', (message) => {
  if (!overview.data.value) return
  if (message) overview.data.value = { ...overview.data.value, ...message }
  else void overview.run()
})

const data = computed(() => overview.data.value)
/** Nothing to show yet; a change of period keeps the last answer up until the next lands. */
const loading = computed(() => !data.value && !overview.error.value)
const games = computed(() => data.value?.games ?? [])

/** The list shows the top 10 until asked for the rest. */
const LIST_LIMIT = 10
const showAll = ref(false)
const shownGames = computed(() => (showAll.value ? games.value : games.value.slice(0, LIST_LIMIT)))

/** Who's playing now, one row per game: its players, and when the first of them started. */
const playing = computed(() => {
  const byGame = new Map<
    string,
    { game: string; iconUrl: string | null; members: ActivityMember[]; since: number }
  >()
  for (const entry of data.value?.playing ?? []) {
    const row = byGame.get(entry.game)
    if (row) {
      row.members.push(entry.member)
      row.since = Math.min(row.since, entry.since)
      row.iconUrl ??= entry.iconUrl
    } else {
      byGame.set(entry.game, {
        game: entry.game,
        iconUrl: entry.iconUrl,
        members: [entry.member],
        since: entry.since,
      })
    }
  }
  return [...byGame.values()].sort(
    (a, b) => b.members.length - a.members.length || a.since - b.since,
  )
})
const playingCount = computed(() => data.value?.playing.length ?? 0)

const hours = (ms: number) =>
  (ms / 3_600_000).toLocaleString('en', { maximumFractionDigits: ms < 36_000_000 ? 1 : 0 })

const topGame = computed(() => {
  const game = games.value[0]
  const total = data.value?.totals.gameMs ?? 0
  if (!game) return null
  const share = total > 0 ? Math.round((game.ms / total) * 100) : 0
  return {
    name: game.name,
    iconUrl: game.iconUrl,
    supporting: `${hours(game.ms)} h · ${plural(game.players, 'player', 'players')} · ${share}% of play`,
  }
})

/** Plain surface tiles after the top game, as on Overview. */
const stats = computed(() => {
  const totals = data.value?.totals
  return [
    { label: 'Hours played', value: totals ? hours(totals.gameMs) : '—', loading: loading.value },
    {
      label: totals?.games === 1 ? 'Game played' : 'Games played',
      value: totals?.games.toLocaleString() ?? '—',
      loading: loading.value,
    },
    {
      label: 'Busiest hour',
      value: heatmap.data.value ? (busiestHour(heatmap.data.value.grid) ?? '—') : '—',
      loading: !heatmap.data.value && !heatmap.error.value,
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
  const query = { ...route.query, game: name }
  if (chosenGame.value) {
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
  const query = new URLSearchParams({ name: chosenGame.value ?? '', days: param.value })
  return apiFetch<GamePlayers>(`/api/activity/game?${query}`)
})

watch([chosenGame, days], () => {
  if (chosenGame.value) void gamePlayers.run()
})

onMounted(() => {
  if (chosenGame.value) void gamePlayers.run()
})

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
</script>

<template>
  <div class="@container flex flex-col gap-4">
    <div class="flex items-start gap-4">
      <PeriodChips v-model="days" />
      <LinkButton v-if="!session.isViewer" to="/games/nights" variant="tonal">
        <span class="icon [--icon-size:18px]" aria-hidden="true">celebration</span>
        Game nights
      </LinkButton>
    </div>

    <!-- The top game leads; the plain tiles share the rest of the row. -->
    <div class="grid gap-4 @5xl:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]">
      <TopItemCard
        label="Top game"
        :title="topGame?.name ?? null"
        :supporting="topGame?.supporting ?? 'Nobody played in this period.'"
        :image="topGame?.iconUrl ?? null"
        icon="sports_esports"
        :loading="loading"
      />
      <div class="grid grid-cols-3 gap-4 @5xl:contents">
        <Card
          :padded="false"
          v-for="stat in stats"
          :key="stat.label"
          class="flex flex-col justify-center gap-1 bg-surface-container! px-6 py-5"
        >
          <span class="text-display-small font-medium whitespace-nowrap">
            <span
              v-if="stat.loading"
              class="skeleton inline-block h-[0.8em] w-[1.6em] align-middle"
            />
            <template v-else>{{ stat.value }}</template>
          </span>
          <span class="text-label-large opacity-80">{{ stat.label }}</span>
        </Card>
      </div>
    </div>

    <!-- A row of its own, so the 24 hours read across the page. -->
    <section aria-labelledby="games-heatmap">
      <div class="section-header">
        <div class="flex items-center gap-1">
          <h2 id="games-heatmap" class="text-title-medium">When people play</h2>
          <RichTooltip
            title="When people play"
            text="Each square is how many members were playing a game at that hour on average over the period. Brighter squares are busier."
          />
        </div>
      </div>
      <StateBlock
        :loading="!heatmap.data.value && !heatmap.error.value"
        :error="heatmap.error.value"
        compact
      >
        <template #skeleton><div class="skeleton h-56 rounded-medium" /></template>
        <ActivityHeatmap
          v-if="heatmap.data.value"
          kind="games"
          :grid="heatmap.data.value.grid"
          :time-zone="heatmap.data.value.timeZone"
        />
      </StateBlock>
    </section>

    <!-- Columns follow the page's own width, so the open rail narrows them too. -->
    <div class="grid items-start gap-6 @4xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <section aria-labelledby="games-top">
        <div class="section-header">
          <h2 id="games-top" class="text-title-medium">Most played</h2>
          <span v-if="games.length > 0" class="pr-4 text-label-large text-on-surface-variant">{{
            games.length
          }}</span>
        </div>
        <div
          :class="
            !loading && games.length === 0 && 'overflow-hidden rounded-medium bg-surface-container'
          "
        >
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
            <List segmented>
              <ListItem
                v-for="(game, index) in shownGames"
                :key="game.name"
                as="button"
                :selected="game.name === chosenGame"
                :class="
                  game.name === chosenGame ? 'bg-secondary-container!' : 'bg-surface-container!'
                "
                :aria-current="game.name === chosenGame ? 'true' : undefined"
                @click="chooseGame(game.name)"
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
                  <!-- As tall as a line of body-small (16px), so the row matches the other ranked
                       lists; the 20px avatars overhang it by 2px each way. -->
                  <span class="flex h-4 items-center gap-2">
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
                  </span>
                </span>
                <template #trailing>
                  <span class="shrink-0 text-body-large tabular-nums">{{
                    formatDuration(game.ms)
                  }}</span>
                </template>
              </ListItem>
            </List>
            <div v-if="games.length > LIST_LIMIT" class="flex justify-center pt-2">
              <Button variant="text" @click="showAll = !showAll">{{
                showAll ? 'Show the top 10' : `Show all ${games.length}`
              }}</Button>
            </div>
          </StateBlock>
        </div>
      </section>

      <div class="flex flex-col gap-6">
        <section aria-labelledby="games-playing">
          <div class="section-header">
            <h2 id="games-playing" class="text-title-medium">Playing now</h2>
            <span v-if="playingCount > 0" class="pr-4 text-label-large text-on-surface-variant">{{
              playingCount
            }}</span>
          </div>
          <div
            :class="
              !loading &&
              playing.length === 0 &&
              'overflow-hidden rounded-medium bg-surface-container'
            "
          >
            <StateBlock
              :loading="loading"
              :error="overview.error.value"
              :empty="playing.length === 0"
              empty-text="Nobody is playing right now."
              compact
            >
              <template #skeleton><SkeletonList :rows="2" two-line trailing="text" /></template>
              <List segmented>
                <ListItem
                  v-for="row in playing"
                  :key="row.game"
                  as="button"
                  class="bg-surface-container!"
                  @click="chooseGame(row.game)"
                >
                  <template #leading>
                    <img
                      v-if="row.iconUrl"
                      class="size-10 shrink-0 rounded-small bg-surface-container-highest object-cover"
                      :src="row.iconUrl"
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
                  </template>
                  <span class="block py-1">
                    <span class="block truncate text-body-large" :title="row.game">{{
                      row.game
                    }}</span>
                    <span class="flex h-4 items-center gap-2">
                      <span class="flex -space-x-1.5">
                        <img
                          v-for="member in row.members.slice(0, 5)"
                          :key="member.id"
                          class="size-5 rounded-full bg-surface-container-highest object-cover ring-2 ring-surface-container"
                          :src="member.avatarUrl"
                          :alt="member.displayName"
                          :title="member.displayName"
                          width="20"
                          height="20"
                        />
                      </span>
                      <span class="truncate text-body-small text-on-surface-variant">{{
                        row.members.length === 1
                          ? row.members[0]!.displayName
                          : plural(row.members.length, 'player', 'players')
                      }}</span>
                    </span>
                  </span>
                  <template #trailing>
                    <span
                      class="shrink-0 self-start pt-1 text-label-small whitespace-nowrap text-on-surface-variant"
                      :title="`Since ${absoluteTime(row.since)}`"
                      >{{ relativeTime(row.since) }}</span
                    >
                  </template>
                </ListItem>
              </List>
            </StateBlock>
          </div>
        </section>

        <!-- Always the last 4 weeks, whatever the period: it says so in its own header. -->
        <TrendChart
          label="Hours played"
          icon="sports_esports"
          :loading="!daily.data.value"
          :daily="daily.data.value?.trends.games.daily"
          :dates="daily.data.value?.dates"
          :week="daily.data.value?.trends.games.week"
          :previous-week="daily.data.value?.trends.games.previousWeek"
        />
      </div>
    </div>

    <SupportingSheet v-model:open="sheetOpen" :headline="sheetGame ?? ''">
      <template #leading>
        <img
          v-if="sheetIcon"
          class="size-14 shrink-0 rounded-medium bg-surface-container object-cover"
          :src="sheetIcon"
          alt=""
          width="56"
          height="56"
        />
        <span
          v-else
          class="grid size-14 shrink-0 place-items-center rounded-medium bg-surface-container text-on-surface-variant"
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
        <List segmented>
          <ListItem
            v-for="(player, index) in detail?.players"
            :key="player.id"
            class="bg-surface-container-high!"
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
                  :src="player.avatarUrl"
                  alt=""
                  width="40"
                  height="40"
                />
              </span>
            </template>
            <span class="block py-1">
              <span
                :style="{ color: discordTextColor(player.color) }"
                class="block truncate text-body-large"
              >
                {{ player.displayName }}
              </span>
              <span class="block truncate font-mono text-body-small text-on-surface-variant">
                {{ player.username }}
              </span>
            </span>
            <template #trailing>
              <div class="flex shrink-0 flex-col items-end">
                <span class="text-body-large tabular-nums">{{ formatDuration(player.ms) }}</span>
                <span
                  v-if="player.playingSince != null"
                  class="text-label-small text-tertiary"
                  :title="`Since ${absoluteTime(player.playingSince)}`"
                  >Playing now</span
                >
              </div>
            </template>
          </ListItem>
        </List>
      </StateBlock>
    </SupportingSheet>
  </div>
</template>
