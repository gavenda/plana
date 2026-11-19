<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button, Card, List, ListItem } from 'tailwind-material3'

import ActivityHeatmap from '@/components/ActivityHeatmap.vue'
import PeriodChips from '@/components/PeriodChips.vue'
import RichTooltip from '@/components/RichTooltip.vue'
import ShareBar from '@/components/ShareBar.vue'
import SupportingSheet from '@/components/SupportingSheet.vue'
import SkeletonList from '@/components/SkeletonList.vue'
import StateBlock from '@/components/StateBlock.vue'
import TopItemCard from '@/components/TopItemCard.vue'
import {
  busiestHour,
  type ActivityOverview,
  type Heatmap,
  type TrackListeners,
  type VivyMusic,
} from '@/lib/activity'
import { apiFetch } from '@/lib/api'
import { discordTextColor } from '@/lib/discord'
import { absoluteTime, formatDuration, relativeTime } from '@/lib/format'
import { useLive } from '@/lib/live'
import { plural, usePeriod } from '@/lib/period'
import { rankClass } from '@/lib/rank'
import { useAsync } from '@/lib/useAsync'

/**
 * The Music page's stats: what members listen to on Spotify (from their Discord presence) and,
 * with VIVY_STATS on, what Vivy played. Neither needs VIVY_CONTROL, so this shows without it.
 */

const route = useRoute()
const router = useRouter()
const { days, param, label: periodLabel } = usePeriod()

const overview = useAsync(() => apiFetch<ActivityOverview>(`/api/activity?days=${param.value}`))
/** Averages over weeks barely move with one play, so the heatmap follows the period only. */
const heatmap = useAsync(() =>
  apiFetch<Heatmap>(`/api/activity/heatmap?kind=music&days=${param.value}`),
)
/** What Vivy, the music bot, played; its section only shows once Plana is connected to Vivy. */
const vivy = useAsync(() => apiFetch<VivyMusic>(`/api/activity/vivy?days=${param.value}`))

function load() {
  void overview.run()
  void heatmap.run()
  void vivy.run()
}

onMounted(load)
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
const tracks = computed(() => data.value?.tracks ?? [])
const listening = computed(() => data.value?.listening ?? [])

const vivyData = computed(() => (vivy.data.value?.enabled ? vivy.data.value : null))
/** Hidden when Vivy isn't connected; an error only comes back when it is. */
const vivyShown = computed(() => vivyData.value != null || vivy.error.value != null)
const vivyLoading = computed(() => !vivyData.value && !vivy.error.value)
const vivyTracks = computed(() => vivyData.value?.tracks ?? [])
const vivyRequesters = computed(() => vivyData.value?.requesters ?? [])

/** Each list shows its top 10 until asked for the rest. */
const LIST_LIMIT = 10
const showAllTracks = ref(false)
const showAllVivy = ref(false)
const shownTracks = computed(() =>
  showAllTracks.value ? tracks.value : tracks.value.slice(0, LIST_LIMIT),
)
const shownVivyTracks = computed(() =>
  showAllVivy.value ? vivyTracks.value : vivyTracks.value.slice(0, LIST_LIMIT),
)
const topPlays = computed(() => tracks.value[0]?.plays ?? 0)
const topVivyPlays = computed(() => vivyTracks.value[0]?.plays ?? 0)
const topRequests = computed(() => vivyRequesters.value[0]?.requests ?? 0)

const topTrack = computed(() => {
  const track = tracks.value[0]
  if (!track) return null
  return {
    title: track.title,
    artUrl: track.artUrl,
    supporting: `${track.artist ?? 'Unknown artist'} · ${plural(track.plays, 'play', 'plays')}`,
  }
})

/** Plain surface tiles after the top track, as on Overview. */
const stats = computed(() => {
  const totals = data.value?.totals
  return [
    {
      label: 'Spotify plays',
      value: totals?.trackPlays.toLocaleString() ?? '—',
      loading: loading.value,
    },
    {
      label: totals?.tracks === 1 ? 'Track played' : 'Tracks played',
      value: totals?.tracks.toLocaleString() ?? '—',
      loading: loading.value,
    },
    vivyData.value
      ? { label: 'Vivy plays', value: vivyData.value.totals.plays.toLocaleString(), loading: false }
      : {
          label: 'Busiest hour',
          value: heatmap.data.value ? (busiestHour(heatmap.data.value.grid) ?? '—') : '—',
          loading: !heatmap.data.value && !heatmap.error.value,
        },
  ]
})

/** The track whose listeners the supporting sheet shows. It lives in the URL, so a link opens it. */
const chosenTrack = computed(() =>
  typeof route.query.track === 'string' && route.query.track ? route.query.track : null,
)

/** The id stays while the sheet animates closed. */
const sheetTrackId = ref(chosenTrack.value)
watch(chosenTrack, (id) => {
  if (id) sheetTrackId.value = id
})

const sheetOpen = computed({
  get: () => chosenTrack.value != null,
  set: (open) => {
    if (!open) closeTrack()
  },
})

/** Whether opening the sheet pushed a history entry, so closing it can pop that instead. */
let pushedChoice = false

// Leaving by the browser's own Back leaves nothing to pop.
watch(chosenTrack, (id) => {
  if (!id) pushedChoice = false
})

/** Opening is a step Back undoes; switching tracks while open just swaps what it shows. */
function chooseTrack(id: string) {
  const query = { ...route.query, track: id }
  if (chosenTrack.value) {
    void router.replace({ query })
  } else {
    pushedChoice = true
    void router.push({ query })
  }
}

function closeTrack() {
  if (pushedChoice) {
    pushedChoice = false
    router.back()
  } else {
    void router.replace({ query: { ...route.query, track: undefined } })
  }
}

const trackListeners = useAsync(() => {
  const query = new URLSearchParams({ id: chosenTrack.value ?? '', days: param.value })
  return apiFetch<TrackListeners>(`/api/activity/track?${query}`)
})

watch([chosenTrack, days], () => {
  if (chosenTrack.value) void trackListeners.run()
})

onMounted(() => {
  if (chosenTrack.value) void trackListeners.run()
})

/** The answer for the track in the sheet only, so a slow earlier one never shows under a later id. */
const trackDetail = computed(() =>
  trackListeners.data.value?.id === sheetTrackId.value ? trackListeners.data.value : null,
)

/** The overview's row for the track, which already has its title and art before the answer lands. */
const sheetTrack = computed(
  () =>
    trackDetail.value?.track ??
    tracks.value.find((track) => track.id === sheetTrackId.value) ??
    null,
)

/** The track's page on Spotify; a presence's sync id is its Spotify track id. */
const spotifyUrl = (id: string) => `https://open.spotify.com/track/${id}`
</script>

<template>
  <div class="@container flex flex-col gap-4">
    <div class="flex flex-wrap items-center gap-4">
      <PeriodChips v-model="days" />
      <span
        v-if="!loading && listening.length === 0"
        class="pr-2 text-label-large text-on-surface-variant"
        >Nobody is listening right now</span
      >
    </div>

    <!-- Only while someone is: an empty panel would say less than the line above. -->
    <section v-if="listening.length > 0" aria-labelledby="music-listening">
      <div class="section-header">
        <h2 id="music-listening" class="text-title-medium">Listening now</h2>
        <span class="pr-4 text-label-large text-on-surface-variant">{{ listening.length }}</span>
      </div>
      <List segmented>
        <ListItem v-for="entry in listening" :key="entry.member.id" class="bg-surface-container!">
          <template #leading>
            <img
              class="size-10 shrink-0 rounded-full bg-surface-container-highest object-cover"
              :src="entry.member.avatarUrl"
              alt=""
              width="40"
              height="40"
            />
          </template>
          <span class="block py-1">
            <span
              :style="{ color: discordTextColor(entry.member.color) }"
              class="block truncate text-body-large"
            >
              {{ entry.member.displayName }}
            </span>
            <span class="flex items-center gap-1.5 text-body-medium text-on-surface-variant">
              <img
                v-if="entry.track.artUrl"
                class="size-4 shrink-0 rounded-extra-small object-cover"
                :src="entry.track.artUrl"
                alt=""
                width="16"
                height="16"
              />
              <span v-else class="shrink-0 icon [--icon-size:16px]" aria-hidden="true"
                >music_note</span
              >
              <span class="truncate"
                >{{ entry.track.title
                }}<template v-if="entry.track.artist"> · {{ entry.track.artist }}</template></span
              >
            </span>
          </span>
          <template #trailing>
            <span
              class="shrink-0 self-start pt-1 text-label-small whitespace-nowrap text-on-surface-variant"
              :title="`Since ${absoluteTime(entry.since)}`"
              >{{ relativeTime(entry.since) }}</span
            >
          </template>
        </ListItem>
      </List>
    </section>

    <!-- The top track leads; the plain tiles share the rest of the row. -->
    <div class="grid gap-4 @5xl:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]">
      <TopItemCard
        label="Top track"
        :title="topTrack?.title ?? null"
        :supporting="topTrack?.supporting ?? 'Nothing played on Spotify in this period.'"
        :image="topTrack?.artUrl ?? null"
        icon="music_note"
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
    <section aria-labelledby="music-heatmap">
      <div class="section-header">
        <div class="flex items-center gap-1">
          <h2 id="music-heatmap" class="text-title-medium">When people listen</h2>
          <RichTooltip
            title="When people listen"
            text="Each square is how many members were listening on Spotify at that hour on average over the period. Brighter squares are busier."
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
          kind="music"
          :grid="heatmap.data.value.grid"
          :time-zone="heatmap.data.value.timeZone"
        />
      </StateBlock>
    </section>

    <!-- Spotify, then Vivy's tracks and requesters; with Vivy's stats off, Spotify alone. The
         columns follow the page's own width, so the open rail narrows them too. -->
    <div class="grid items-start gap-6" :class="vivyShown && '@3xl:grid-cols-2 @6xl:grid-cols-3'">
      <section aria-labelledby="music-tracks">
        <div class="section-header">
          <h2 id="music-tracks" class="text-title-medium">Most played on Spotify</h2>
          <span v-if="tracks.length > 0" class="pr-4 text-label-large text-on-surface-variant">{{
            tracks.length
          }}</span>
        </div>
        <div
          :class="
            !loading && tracks.length === 0 && 'overflow-hidden rounded-medium bg-surface-container'
          "
        >
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
            <List segmented>
              <!-- The row picks the track; the Spotify link beside it is its own control. -->
              <ListItem
                v-for="(track, index) in shownTracks"
                :key="track.id"
                :selected="track.id === chosenTrack"
                :class="
                  track.id === chosenTrack ? 'bg-secondary-container!' : 'bg-surface-container!'
                "
              >
                <button
                  type="button"
                  class="relative -my-2.5 -ms-4 flex min-h-14 w-[calc(100%+1rem)] min-w-0 cursor-pointer items-center gap-4 rounded-[inherit] py-2.5 ps-4 text-left before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit] before:bg-current before:opacity-0 before:transition-opacity hover:before:opacity-8 focus:outline-none focus-visible:outline-3 focus-visible:-outline-offset-3 focus-visible:outline-secondary focus-visible:outline-solid"
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
                    class="size-10 shrink-0 rounded-small bg-surface-container-highest object-cover"
                    :src="track.artUrl"
                    :alt="track.album ?? ''"
                    :title="track.album ?? undefined"
                    width="40"
                    height="40"
                  />
                  <span
                    v-else
                    class="grid size-10 shrink-0 place-items-center rounded-small bg-surface-container-highest text-on-surface-variant"
                    aria-hidden="true"
                    ><span class="icon [--icon-size:20px]">music_note</span></span
                  >
                  <div class="min-w-0 flex-1 py-1">
                    <p class="truncate text-body-large" :title="track.title">{{ track.title }}</p>
                    <p class="truncate text-body-small text-on-surface-variant">
                      {{ track.artist ?? 'Unknown artist' }}
                    </p>
                    <ShareBar :value="track.plays" :max="topPlays" />
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
                <template #trailing>
                  <RichTooltip
                    title="Open in Spotify"
                    :href="spotifyUrl(track.id)"
                    icon="open_in_new"
                    narrow
                  />
                </template>
              </ListItem>
            </List>
            <div v-if="tracks.length > LIST_LIMIT" class="flex justify-center pt-2">
              <Button variant="text" @click="showAllTracks = !showAllTracks">{{
                showAllTracks ? 'Show the top 10' : `Show all ${tracks.length}`
              }}</Button>
            </div>
          </StateBlock>
        </div>
      </section>

      <!-- Vivy, the music bot: only with VIVY_STATS on, reading the Redis both bots share. -->
      <section v-if="vivyShown" aria-labelledby="music-vivy-tracks">
        <div class="section-header">
          <div class="flex items-center gap-1">
            <h2 id="music-vivy-tracks" class="text-title-medium">Most played with Vivy</h2>
            <RichTooltip
              title="Most played with Vivy"
              text="Tracks the music bot played in this server, most played first. Tracks Vivy picked on its own with autoplay aren’t counted."
            />
          </div>
          <span
            v-if="vivyTracks.length > 0"
            class="pr-4 text-label-large text-on-surface-variant"
            >{{ vivyTracks.length }}</span
          >
        </div>
        <div
          :class="
            !vivyLoading &&
            vivyTracks.length === 0 &&
            'overflow-hidden rounded-medium bg-surface-container'
          "
        >
          <StateBlock
            :loading="vivyLoading"
            :error="vivy.error.value"
            :empty="vivyTracks.length === 0"
            empty-text="Vivy played nothing in this period."
            compact
          >
            <template #skeleton>
              <SkeletonList :rows="5" leading="art" rank two-line trailing="stack" />
            </template>
            <List segmented>
              <ListItem
                v-for="(track, index) in shownVivyTracks"
                :key="track.id"
                :class="track.url && 'pr-2'"
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
                      alt=""
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
                  <ShareBar :value="track.plays" :max="topVivyPlays" />
                </span>
                <template #trailing>
                  <span class="flex items-center gap-4">
                    <div class="flex shrink-0 flex-col items-end">
                      <span class="text-body-large tabular-nums">{{
                        plural(track.plays, 'play', 'plays')
                      }}</span>
                      <span v-if="track.ms > 0" class="text-label-small text-on-surface-variant">{{
                        formatDuration(track.ms)
                      }}</span>
                    </div>
                    <RichTooltip
                      v-if="track.url"
                      title="Open track"
                      :href="track.url"
                      icon="open_in_new"
                      narrow
                    />
                  </span>
                </template>
              </ListItem>
            </List>
            <div v-if="vivyTracks.length > LIST_LIMIT" class="flex justify-center pt-2">
              <Button variant="text" @click="showAllVivy = !showAllVivy">{{
                showAllVivy ? 'Show the top 10' : `Show all ${vivyTracks.length}`
              }}</Button>
            </div>
          </StateBlock>
        </div>
      </section>

      <section v-if="vivyShown" aria-labelledby="music-vivy-requesters">
        <div class="section-header">
          <h2 id="music-vivy-requesters" class="text-title-medium">Top Vivy requesters</h2>
          <span
            v-if="vivyData && vivyData.totals.requesters > 0"
            class="pr-4 text-label-large text-on-surface-variant"
            >{{ vivyData.totals.requesters }}</span
          >
        </div>
        <div
          :class="
            !vivyLoading &&
            vivyRequesters.length === 0 &&
            'overflow-hidden rounded-medium bg-surface-container'
          "
        >
          <StateBlock
            :loading="vivyLoading"
            :error="vivy.error.value"
            :empty="vivyRequesters.length === 0"
            empty-text="Nobody asked Vivy for a track in this period."
            compact
          >
            <template #skeleton><SkeletonList :rows="5" rank two-line trailing="text" /></template>
            <List segmented>
              <ListItem
                v-for="(requester, index) in vivyRequesters"
                :key="requester.id"
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
                      :src="requester.avatarUrl"
                      alt=""
                      width="40"
                      height="40"
                    />
                  </span>
                </template>
                <span class="block py-1">
                  <span
                    :style="{ color: discordTextColor(requester.color) }"
                    class="block truncate text-body-large"
                  >
                    {{ requester.displayName }}
                  </span>
                  <span class="block truncate font-mono text-body-small text-on-surface-variant">
                    {{ requester.username }}
                  </span>
                  <ShareBar :value="requester.requests" :max="topRequests" />
                </span>
                <template #trailing>
                  <span class="shrink-0 text-body-large tabular-nums">{{
                    plural(requester.requests, 'request', 'requests')
                  }}</span>
                </template>
              </ListItem>
            </List>
          </StateBlock>
        </div>
      </section>
    </div>

    <SupportingSheet v-model:open="sheetOpen" :headline="sheetTrack?.title ?? ''">
      <template #leading>
        <img
          v-if="sheetTrack?.artUrl"
          class="size-14 shrink-0 rounded-medium bg-surface-container object-cover"
          :src="sheetTrack.artUrl"
          alt=""
          width="56"
          height="56"
        />
        <span
          v-else
          class="grid size-14 shrink-0 place-items-center rounded-medium bg-surface-container text-on-surface-variant"
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
        <List segmented>
          <ListItem
            v-for="(listener, index) in trackDetail?.listeners"
            :key="listener.id"
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
                  :src="listener.avatarUrl"
                  alt=""
                  width="40"
                  height="40"
                />
              </span>
            </template>
            <span class="block py-1">
              <span
                :style="{ color: discordTextColor(listener.color) }"
                class="block truncate text-body-large"
              >
                {{ listener.displayName }}
              </span>
              <span class="block truncate font-mono text-body-small text-on-surface-variant">
                {{ listener.username }}
              </span>
            </span>
            <template #trailing>
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
            </template>
          </ListItem>
        </List>
      </StateBlock>
    </SupportingSheet>
  </div>
</template>
