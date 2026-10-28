<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import ActivityStrip from '@/components/ActivityStrip.vue'
import AppSearchBar from '@/components/AppSearchBar.vue'
import AuditSummary from '@/components/AuditSummary.vue'
import DiscordMention from '@/components/DiscordMention.vue'
import FilterChip from '@/components/FilterChip.vue'
import PlanaSays from '@/components/PlanaSays.vue'
import SkeletonList from '@/components/SkeletonList.vue'
import StateBlock from '@/components/StateBlock.vue'
import type { MemberActivity } from '@/lib/activity'
import { apiFetch } from '@/lib/api'
import { auditIcon, describeAudit, toneContainerClass } from '@/lib/audit'
import { formatUntil } from '@/lib/birthdays'
import { formatMonthDay } from '@/lib/dates'
import { discordTextColor } from '@/lib/discord'
import { absoluteTime, dayLabel, formatDuration, relativeTime } from '@/lib/format'
import { useLive } from '@/lib/live'
import type { MemberListItem, MemberProfile } from '@/lib/members'
import { useAsync } from '@/lib/useAsync'
import { useGuildStore } from '@/stores/guild'

/**
 * M3's list-detail layout: the members on the left and the chosen one's records on the right.
 * Below the expanded window class there is room for one pane, so choosing a member swaps the
 * list for their details, and Back (or the back button) returns to it.
 */

/** `days` null is all time; in the URL and the API it is `all`. */
const PERIODS: { days: number | null; label: string }[] = [
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
  { days: null, label: 'All time' },
]
const DEFAULT_DAYS = 30

/** A long server's list is drawn a page at a time; the search reaches everyone. */
const PAGE_SIZE = 100

const daysParam = (days: number | null) => (days == null ? 'all' : String(days))

const route = useRoute()
const router = useRouter()
const guild = useGuildStore()

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

const list = useAsync(() => apiFetch<MemberListItem[]>('/api/members'))
const listLoading = computed(() => !list.data.value && !list.error.value)

const search = ref(typeof route.query.q === 'string' ? route.query.q : '')
const shown = ref(PAGE_SIZE)

watch(search, (value) => {
  shown.value = PAGE_SIZE
  void router.replace({ query: { ...route.query, q: value.trim() || undefined } })
})

const matches = computed(() => {
  const all = list.data.value ?? []
  const needle = search.value.trim().toLowerCase()
  if (!needle) return all
  return all.filter(
    (member) =>
      member.displayName.toLowerCase().includes(needle) ||
      member.username.toLowerCase().includes(needle) ||
      member.id === needle,
  )
})

const visible = computed(() => matches.value.slice(0, shown.value))

// ---------------------------------------------------------------------------
// The chosen member, kept in the URL so a link opens it
// ---------------------------------------------------------------------------

const chosen = computed(() =>
  typeof route.query.member === 'string' && /^\d{17,20}$/.test(route.query.member)
    ? route.query.member
    : null,
)

/** Whether choosing pushed a history entry, so the back button can pop it instead. */
let pushedChoice = false
watch(chosen, (id) => {
  if (!id) pushedChoice = false
})

/** The first choice is a step Back undoes; switching between members just swaps the pane. */
function choose(id: string) {
  const query = { ...route.query, member: id }
  if (chosen.value) {
    void router.replace({ query })
  } else {
    pushedChoice = true
    void router.push({ query })
  }
}

function backToList() {
  if (pushedChoice) {
    pushedChoice = false
    router.back()
  } else {
    void router.replace({ query: { ...route.query, member: undefined } })
  }
}

function daysFromQuery(): number | null {
  const raw = route.query.days
  if (raw === 'all') return null
  const days = Number(raw)
  return PERIODS.some((period) => period.days === days) ? days : DEFAULT_DAYS
}

const days = ref(daysFromQuery())

watch(days, (value) => {
  void router.replace({
    query: { ...route.query, days: value === DEFAULT_DAYS ? undefined : daysParam(value) },
  })
})

const profile = useAsync(() =>
  apiFetch<MemberProfile>(`/api/members/${chosen.value}?days=${daysParam(days.value)}`),
)

watch([chosen, days], () => {
  if (chosen.value) void profile.run()
})

/** The last 6 months a day at a time, for the activity strip; it doesn't follow the period. */
const activity = useAsync(async () => {
  const id = chosen.value
  return { id, ...(await apiFetch<MemberActivity>(`/api/members/${id}/activity`)) }
})

watch(chosen, () => {
  if (chosen.value) void activity.run()
})

/** Only the chosen member's strip, so a slow earlier answer never shows under a later name. */
const strip = computed(() =>
  activity.data.value?.id === chosen.value ? activity.data.value : null,
)

/** Only the chosen member's answer, so a slow earlier one never shows under a later name. */
const detail = computed(() =>
  profile.data.value?.member.id === chosen.value ? profile.data.value : null,
)

/** What the header shows before the member's own answer lands. */
const person = computed(
  () => detail.value?.member ?? list.data.value?.find((member) => member.id === chosen.value),
)

onMounted(() => {
  // Role colours in the audit summaries; they show without them if this fails.
  void guild.load()
  void list.run()
  if (chosen.value) {
    void profile.run()
    void activity.run()
  }
})

// ---------------------------------------------------------------------------
// Live updates
// ---------------------------------------------------------------------------

/** Joins, leaves and role changes reach the list through triage's notices. */
useLive('triage', () => {
  if (list.data.value) void list.run()
})

useLive('birthdays', () => {
  if (list.data.value) void list.run()
  if (chosen.value) void profile.run()
})

useLive('voice', () => {
  if (chosen.value) void profile.run()
})

useLive('audit', (message) => {
  const id = chosen.value
  if (!id) return
  if (!message || message.entry.targetId === id || message.entry.actorId === id) void profile.run()
})

/** Presence changes often; only the chosen member's start or stop is worth a reload. */
let wasActive = false
useLive('presence', (message) => {
  const id = chosen.value
  if (!id || !message) return
  const active =
    message.playing.some((entry) => entry.member.id === id) ||
    message.listening.some((entry) => entry.member.id === id)
  if (active || wasActive) void profile.run()
  wasActive = active
})

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------

const periodLabel = computed(() => PERIODS.find((period) => period.days === days.value)?.label)

const plural = (count: number, one: string, many: string) =>
  `${count.toLocaleString()} ${count === 1 ? one : many}`

const hours = (ms: number) =>
  (ms / 3_600_000).toLocaleString('en', { maximumFractionDigits: ms < 36_000_000 ? 1 : 0 })

/** Each tile takes a different tonal container, as on Overview. */
const stats = computed(() => {
  const data = detail.value
  return [
    {
      label: 'Hours in voice',
      value: data ? hours(data.voice.ms) : '—',
      tone: 'bg-primary-container text-on-primary-container',
    },
    {
      label: 'Hours played',
      value: data ? hours(data.games.ms) : '—',
      tone: 'bg-secondary-container text-on-secondary-container',
    },
    {
      label: data?.music.plays === 1 ? 'Track played' : 'Tracks played',
      value: data?.music.plays.toLocaleString() ?? '—',
      tone: 'bg-tertiary-container text-on-tertiary-container',
    },
  ]
})

/** What they are doing this moment: in voice, playing, listening. */
const rightNow = computed(() => {
  const data = detail.value
  if (!data) return []
  const items: { key: string; icon: string; label: string; what: string; since: number }[] = []
  if (data.voice.now) {
    items.push({
      key: 'voice',
      icon: 'volume_up',
      label: 'In',
      what: data.voice.now.channel.name,
      since: data.voice.now.since,
    })
  }
  for (const game of data.games.top) {
    if (game.playingSince != null) {
      items.push({
        key: `game:${game.name}`,
        icon: 'sports_esports',
        label: 'Playing',
        what: game.name,
        since: game.playingSince,
      })
    }
  }
  if (data.music.listening) {
    const { track, since } = data.music.listening
    items.push({
      key: 'track',
      icon: 'music_note',
      label: 'Listening to',
      what: track.artist ? `${track.title} · ${track.artist}` : track.title,
      since,
    })
  }
  return items
})

const facts = computed(() => {
  const data = detail.value
  if (!data) return []
  const items: { label: string; value: string; title?: string }[] = []
  if (data.joinedAt != null) {
    items.push({
      label: 'Joined',
      value: relativeTime(data.joinedAt),
      title: absoluteTime(data.joinedAt),
    })
  }
  if (data.createdAt != null) {
    items.push({
      label: 'Account created',
      value: relativeTime(data.createdAt),
      title: absoluteTime(data.createdAt),
    })
  }
  items.push({
    label: 'Birthday',
    value: data.birthday
      ? `${formatMonthDay(data.birthday.month, data.birthday.day)} · ${formatUntil(data.birthday.daysUntil)}`
      : 'Not saved',
  })
  return items
})

const auditItems = computed(() =>
  (detail.value?.audit.entries ?? []).map((entry) => ({
    entry,
    description: describeAudit(entry),
  })),
)

/** Where the member stood in an entry: the one who did it, or the one it was done to. */
function roleIn(entry: MemberProfile['audit']['entries'][number]): string {
  return entry.actorId === chosen.value && entry.targetId !== chosen.value
    ? 'By them'
    : 'About them'
}
</script>

<template>
  <div
    class="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)] gap-6 expanded:grid-cols-[minmax(280px,360px)_minmax(0,1fr)] large:grid-cols-[400px_minmax(0,1fr)]"
  >
    <!-- The page fits the window (the route's `fit`): each pane scrolls on its own, so the list
         keeps its place beside the detail and the footer stays in view. -->
    <section
      aria-label="Members"
      class="flex min-h-0 min-w-0 flex-col gap-3"
      :class="chosen && 'max-expanded:hidden'"
    >
      <div role="search">
        <!-- The count lives in the bar, so the list's top lines up with the detail's first card:
             the whole list in the placeholder, the matches beside the query once there is one. -->
        <AppSearchBar
          v-model="search"
          :placeholder="
            list.data.value
              ? `Search ${plural(list.data.value.length, 'member', 'members')}`
              : 'Search members'
          "
          label="Search members"
        >
          <template v-if="search.trim() && list.data.value" #trailing>{{
            plural(matches.length, 'match', 'matches')
          }}</template>
        </AppSearchBar>
        <p v-if="list.data.value" class="sr-only" aria-live="polite">
          {{
            search.trim()
              ? plural(matches.length, 'match', 'matches')
              : plural(matches.length, 'member', 'members')
          }}
        </p>
      </div>

      <div
        class="min-h-0 flex-1 overflow-y-auto"
        :class="!listLoading && matches.length === 0 && 'card'"
      >
        <StateBlock
          :loading="listLoading"
          :error="list.error.value"
          :empty="matches.length === 0"
          :empty-text="search.trim() ? 'No members match.' : 'No members yet.'"
          :retry="list.run"
        >
          <template #skeleton><SkeletonList :rows="8" two-line /></template>
          <ul class="segmented-list">
            <li v-for="member in visible" :key="member.id" class="segmented-item p-0">
              <button
                type="button"
                class="state-layer flex min-h-14 w-full min-w-0 cursor-pointer items-center gap-4 rounded-[inherit] px-4 py-2 text-left transition-colors duration-200 ease-effects-fast"
                :class="
                  member.id === chosen && 'bg-secondary-container text-on-secondary-container'
                "
                :aria-current="member.id === chosen ? 'true' : undefined"
                @click="choose(member.id)"
              >
                <img
                  class="size-10 shrink-0 rounded-full bg-surface-container-highest object-cover"
                  :src="member.avatarUrl"
                  alt=""
                  width="40"
                  height="40"
                  loading="lazy"
                />
                <div class="min-w-0 flex-1 py-1">
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
                <span
                  v-if="member.birthday"
                  class="shrink-0 icon text-on-surface-variant [--icon-size:18px]"
                  :title="`Birthday: ${formatMonthDay(member.birthday.month, member.birthday.day)}`"
                  aria-hidden="true"
                  >cake</span
                >
              </button>
            </li>
          </ul>
          <div v-if="matches.length > visible.length" class="flex justify-center pt-3">
            <button class="btn btn-tonal" type="button" @click="shown += PAGE_SIZE">
              Show more
            </button>
          </div>
        </StateBlock>
      </div>
    </section>

    <!-- Detail pane. -->
    <section
      aria-label="Member details"
      class="flex min-h-0 min-w-0 flex-col"
      :class="!chosen && 'max-expanded:hidden'"
    >
      <div
        v-if="!chosen"
        class="card grid h-full place-items-center bg-surface-container-low px-6 py-10"
      >
        <PlanaSays mood="attentive" layout="column"
          >Choose a member. I'll bring up everything I have on file.</PlanaSays
        >
      </div>

      <div v-else class="flex min-h-0 flex-1 flex-col gap-3">
        <!-- Who it is stays put; their records scroll beneath. As tall as the search bar beside it,
             so both panes' first cards start level. -->
        <header class="flex h-14 shrink-0 items-center gap-4">
          <button
            type="button"
            class="icon-btn shrink-0 text-on-surface expanded:hidden"
            aria-label="Back to members"
            @click="backToList"
          >
            <span class="icon" aria-hidden="true">arrow_back</span>
          </button>
          <img
            v-if="person"
            class="size-14 shrink-0 rounded-full bg-surface-container-highest object-cover"
            :src="person.avatarUrl"
            alt=""
            width="56"
            height="56"
          />
          <span v-else class="skeleton size-14 shrink-0 rounded-full" aria-hidden="true" />
          <div class="min-w-0 flex-1">
            <h2
              class="truncate text-headline-small"
              :style="{ color: discordTextColor(person?.color) }"
            >
              {{ person?.displayName ?? 'Member' }}
            </h2>
            <p class="truncate font-mono text-body-medium text-on-surface-variant">
              {{ person?.username ?? chosen }}
            </p>
          </div>
          <span
            v-if="detail && !detail.inServer"
            class="shrink-0 rounded-sm bg-error-container px-2 py-1 text-label-medium text-on-error-container"
            >Left the server</span
          >
        </header>

        <div class="min-h-0 flex-1 overflow-y-auto">
          <StateBlock
            :loading="!detail && !profile.error.value"
            :error="profile.error.value"
            :retry="profile.run"
          >
            <template #skeleton><SkeletonList :rows="4" two-line /></template>

            <div v-if="detail" class="flex flex-col gap-4">
              <!-- Who they are. -->
              <div class="card flex flex-col gap-4 px-6 py-5">
                <dl class="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-4">
                  <div v-for="fact in facts" :key="fact.label">
                    <dt class="text-label-medium text-on-surface-variant">{{ fact.label }}</dt>
                    <dd class="text-body-large" :title="fact.title">{{ fact.value }}</dd>
                  </div>
                </dl>
                <div v-if="detail.roles.length > 0">
                  <p class="pb-2 text-label-medium text-on-surface-variant">Roles</p>
                  <div class="flex flex-wrap gap-1.5 text-body-medium">
                    <DiscordMention
                      v-for="role in detail.roles"
                      :key="role.id"
                      kind="role"
                      :name="role.name"
                      :color="role.color"
                    />
                  </div>
                </div>
              </div>

              <ul v-if="rightNow.length > 0" class="flex flex-col gap-2">
                <li
                  v-for="item in rightNow"
                  :key="item.key"
                  class="card flex items-center gap-3 bg-tertiary-container px-4 py-3 text-body-medium text-on-tertiary-container"
                >
                  <span class="icon [--icon-size:20px]" aria-hidden="true">{{ item.icon }}</span>
                  <span class="min-w-0 flex-1 truncate"
                    >{{ item.label }} <strong class="font-medium">{{ item.what }}</strong></span
                  >
                  <span
                    class="shrink-0 text-label-small"
                    :title="`Since ${absoluteTime(item.since)}`"
                    >{{ relativeTime(item.since) }}</span
                  >
                </li>
              </ul>

              <section aria-labelledby="member-activity">
                <div class="section-header">
                  <h3 id="member-activity" class="text-title-medium">Last 6 months</h3>
                </div>
                <StateBlock
                  :loading="!strip && !activity.error.value"
                  :error="activity.error.value"
                  :retry="activity.run"
                  compact
                >
                  <template #skeleton><div class="skeleton h-48 rounded-md" /></template>
                  <ActivityStrip v-if="strip" :days="strip.days" :time-zone="strip.timeZone" />
                </StateBlock>
              </section>

              <div class="flex flex-wrap gap-2" role="group" aria-label="Period">
                <FilterChip
                  v-for="period in PERIODS"
                  :key="period.label"
                  :label="period.label"
                  :model-value="days === period.days"
                  @update:model-value="days = period.days"
                />
              </div>

              <div class="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-4">
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

              <div class="grid items-start gap-6 large:grid-cols-2">
                <section aria-labelledby="member-voice">
                  <div class="section-header">
                    <h3 id="member-voice" class="text-title-medium">Voice channels</h3>
                    <span class="pr-4 text-label-large text-on-surface-variant">{{
                      plural(detail.voice.sessions, 'session', 'sessions')
                    }}</span>
                  </div>
                  <div v-if="detail.voice.channels.length === 0" class="card">
                    <StateBlock
                      empty
                      :empty-text="`No time in voice in ${periodLabel?.toLowerCase()}.`"
                    />
                  </div>
                  <ol v-else class="segmented-list">
                    <li
                      v-for="channel in detail.voice.channels"
                      :key="channel.id"
                      class="segmented-item"
                    >
                      <span
                        class="grid size-10 shrink-0 place-items-center rounded-sm bg-surface-container-highest text-on-surface-variant"
                        aria-hidden="true"
                        ><span class="icon [--icon-size:20px]">volume_up</span></span
                      >
                      <div class="min-w-0 flex-1 py-1">
                        <p class="truncate text-body-large" :title="channel.name">
                          {{ channel.name }}
                        </p>
                        <p class="truncate text-body-small text-on-surface-variant">
                          {{ plural(channel.sessions, 'session', 'sessions') }}
                        </p>
                      </div>
                      <span class="shrink-0 text-body-large tabular-nums">{{
                        formatDuration(channel.ms)
                      }}</span>
                    </li>
                  </ol>
                </section>

                <section aria-labelledby="member-games">
                  <div class="section-header">
                    <h3 id="member-games" class="text-title-medium">Games</h3>
                    <span class="pr-4 text-label-large text-on-surface-variant">{{
                      plural(detail.games.count, 'game', 'games')
                    }}</span>
                  </div>
                  <div v-if="detail.games.top.length === 0" class="card">
                    <StateBlock
                      empty
                      :empty-text="`No games played in ${periodLabel?.toLowerCase()}.`"
                    />
                  </div>
                  <ol v-else class="segmented-list">
                    <li v-for="game in detail.games.top" :key="game.name" class="segmented-item">
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
                        <p class="truncate text-body-small text-on-surface-variant">
                          {{ plural(game.sessions, 'session', 'sessions') }}
                        </p>
                      </div>
                      <div class="flex shrink-0 flex-col items-end">
                        <span class="text-body-large tabular-nums">{{
                          formatDuration(game.ms)
                        }}</span>
                        <span
                          v-if="game.playingSince != null"
                          class="text-label-small text-tertiary"
                          :title="`Since ${absoluteTime(game.playingSince)}`"
                          >Playing now</span
                        >
                      </div>
                    </li>
                  </ol>
                </section>

                <section aria-labelledby="member-music">
                  <div class="section-header">
                    <h3 id="member-music" class="text-title-medium">Music</h3>
                    <span class="pr-4 text-label-large text-on-surface-variant">{{
                      plural(detail.music.count, 'track', 'tracks')
                    }}</span>
                  </div>
                  <div v-if="detail.music.top.length === 0" class="card">
                    <StateBlock
                      empty
                      :empty-text="`No tracks played in ${periodLabel?.toLowerCase()}.`"
                    />
                  </div>
                  <ol v-else class="segmented-list">
                    <li
                      v-for="entry in detail.music.top"
                      :key="entry.track.id"
                      class="segmented-item"
                    >
                      <img
                        v-if="entry.track.artUrl"
                        class="size-10 shrink-0 rounded-sm bg-surface-container-highest object-cover"
                        :src="entry.track.artUrl"
                        alt=""
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
                        <p class="truncate text-body-large" :title="entry.track.title">
                          {{ entry.track.title }}
                        </p>
                        <p class="truncate text-body-small text-on-surface-variant">
                          {{ entry.track.artist ?? 'Unknown artist' }}
                        </p>
                      </div>
                      <span class="shrink-0 text-body-large tabular-nums">{{
                        plural(entry.plays, 'play', 'plays')
                      }}</span>
                    </li>
                  </ol>
                </section>
              </div>

              <section aria-labelledby="member-audit">
                <div class="section-header">
                  <h3 id="member-audit" class="text-title-medium">Audit history</h3>
                  <span
                    v-if="detail.audit.total > auditItems.length"
                    class="pr-4 text-label-large text-on-surface-variant"
                    >Latest {{ auditItems.length }} of
                    {{ detail.audit.total.toLocaleString() }}</span
                  >
                </div>
                <div v-if="auditItems.length === 0" class="card">
                  <StateBlock empty empty-text="Nothing recorded about this member." />
                </div>
                <ul v-else class="segmented-list">
                  <li
                    v-for="{ entry, description } in auditItems"
                    :key="entry.id"
                    class="segmented-item"
                  >
                    <span
                      class="grid size-10 shrink-0 place-items-center rounded-full"
                      :class="toneContainerClass(description.tone)"
                      aria-hidden="true"
                    >
                      <span class="icon [--icon-size:20px]">{{ auditIcon(entry.action) }}</span>
                    </span>
                    <div class="min-w-0 flex-1 py-1">
                      <p class="text-body-large [overflow-wrap:anywhere]">
                        <AuditSummary :parts="description.parts" />
                      </p>
                      <p class="text-body-medium text-on-surface-variant">
                        {{ description.label }} · {{ roleIn(entry) }}
                      </p>
                    </div>
                    <time
                      class="shrink-0 self-start pt-1 text-label-small text-on-surface-variant"
                      :datetime="new Date(entry.createdAt).toISOString()"
                      :title="absoluteTime(entry.createdAt)"
                      >{{ dayLabel(entry.createdAt) }}</time
                    >
                  </li>
                </ul>
              </section>
            </div>
          </StateBlock>
        </div>
      </div>
    </section>
  </div>
</template>
