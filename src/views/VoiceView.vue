<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import FilterChip from '@/components/FilterChip.vue'
import SupportingSheet from '@/components/SupportingSheet.vue'
import SkeletonList from '@/components/SkeletonList.vue'
import StateBlock from '@/components/StateBlock.vue'
import { apiFetch } from '@/lib/api'
import { discordTextColor } from '@/lib/discord'
import { absoluteTime, formatDuration, relativeTime } from '@/lib/format'
import { useAsync } from '@/lib/useAsync'
import type { MemberVoice, VoiceOverview } from '@/lib/voice'

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

function daysFromQuery(): number | null {
  const raw = route.query.days
  if (raw === 'all') return null
  const days = Number(raw)
  return PERIODS.some((period) => period.days === days) ? days : DEFAULT_DAYS
}

const days = ref(daysFromQuery())
const overview = useAsync(() => apiFetch<VoiceOverview>(`/api/voice?days=${daysParam(days.value)}`))

onMounted(() => void overview.run())

watch(days, (value) => {
  void router.replace({
    query: { ...route.query, days: value === DEFAULT_DAYS ? undefined : daysParam(value) },
  })
  void overview.run()
})

const data = computed(() => overview.data.value)
/** Nothing to show yet; a change of period keeps the last answer up until the next lands. */
const loading = computed(() => !data.value && !overview.error.value)
const members = computed(() => data.value?.members ?? [])
const channels = computed(() => data.value?.channels ?? [])
const inVoice = computed(() => data.value?.now ?? [])

const hours = (ms: number) =>
  (ms / 3_600_000).toLocaleString('en', { maximumFractionDigits: ms < 36_000_000 ? 1 : 0 })

/** Each tile takes a different tonal container, as on Overview. */
const stats = computed(() => {
  const totals = data.value?.totals
  return [
    {
      label: 'Hours in voice',
      value: totals ? hours(totals.ms) : '—',
      tone: 'bg-primary-container text-on-primary-container',
    },
    {
      label: totals?.members === 1 ? 'Member in voice' : 'Members in voice',
      value: totals?.members.toLocaleString() ?? '—',
      tone: 'bg-secondary-container text-on-secondary-container',
    },
    {
      label: totals?.sessions === 1 ? 'Session' : 'Sessions',
      value: totals?.sessions.toLocaleString() ?? '—',
      tone: 'bg-tertiary-container text-on-tertiary-container',
    },
  ]
})

/** The member whose channels the supporting sheet shows. It lives in the URL, so a link opens it. */
const chosenMember = computed(() =>
  typeof route.query.member === 'string' && route.query.member ? route.query.member : null,
)

/** The member stays while the sheet animates closed. */
const sheetMember = ref(chosenMember.value)
watch(chosenMember, (id) => {
  if (id) sheetMember.value = id
})

const sheetOpen = computed({
  get: () => chosenMember.value != null,
  set: (open) => {
    if (!open) closeMember()
  },
})

/** Whether opening the sheet pushed a history entry, so closing it can pop that instead. */
let pushedChoice = false

// Leaving by the browser's own Back leaves nothing to pop.
watch(chosenMember, (id) => {
  if (!id) pushedChoice = false
})

/** Opening is a step Back undoes; switching members while open just swaps what it shows. */
function chooseMember(id: string) {
  const query = { ...route.query, member: id }
  if (chosenMember.value) {
    void router.replace({ query })
  } else {
    pushedChoice = true
    void router.push({ query })
  }
}

function closeMember() {
  if (pushedChoice) {
    pushedChoice = false
    router.back()
  } else {
    void router.replace({ query: { ...route.query, member: undefined } })
  }
}

const memberVoice = useAsync(() => {
  const query = new URLSearchParams({ id: chosenMember.value ?? '', days: daysParam(days.value) })
  return apiFetch<MemberVoice>(`/api/voice/member?${query}`)
})

watch([chosenMember, days], () => {
  if (chosenMember.value) void memberVoice.run()
})

onMounted(() => {
  if (chosenMember.value) void memberVoice.run()
})

/** The answer for the member in the sheet only, so a slow earlier one never shows under a later name. */
const detail = computed(() =>
  memberVoice.data.value?.member.id === sheetMember.value ? memberVoice.data.value : null,
)

/** What the sheet's header shows before the member's own answer lands. */
const sheetPerson = computed(
  () =>
    detail.value?.member ??
    members.value.find((member) => member.id === sheetMember.value) ??
    inVoice.value.find((entry) => entry.member.id === sheetMember.value)?.member ??
    null,
)

const periodLabel = computed(() => PERIODS.find((period) => period.days === days.value)?.label)

const plural = (count: number, one: string, many: string) =>
  `${count.toLocaleString()} ${count === 1 ? one : many}`
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap gap-2" role="group" aria-label="Period">
      <FilterChip
        v-for="period in PERIODS"
        :key="period.label"
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
        <span class="text-display-small font-medium">
          <span v-if="loading" class="skeleton inline-block h-[0.8em] w-[1.6em] align-middle" />
          <template v-else>{{ stat.value }}</template>
        </span>
        <span class="text-label-large opacity-80">{{ stat.label }}</span>
      </div>
    </div>

    <section aria-labelledby="voice-now">
      <div class="section-header">
        <h2 id="voice-now" class="text-title-medium">In voice now</h2>
        <span v-if="inVoice.length > 0" class="pr-4 text-label-large text-on-surface-variant">{{
          inVoice.length
        }}</span>
      </div>
      <div :class="!loading && inVoice.length === 0 && 'card'">
        <StateBlock
          :loading="loading"
          :error="overview.error.value"
          :empty="inVoice.length === 0"
          empty-text="Nobody is in voice right now."
          compact
        >
          <template #skeleton><SkeletonList :rows="2" two-line trailing="text" /></template>
          <ul class="segmented-list">
            <li v-for="entry in inVoice" :key="entry.member.id" class="segmented-item p-0">
              <button
                type="button"
                class="state-layer flex min-h-14 w-full min-w-0 cursor-pointer items-center gap-4 rounded-[inherit] px-4 py-2 text-left"
                @click="chooseMember(entry.member.id)"
              >
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
                    <span class="shrink-0 icon [--icon-size:16px]" aria-hidden="true"
                      >volume_up</span
                    >
                    <span class="truncate">{{ entry.channel.name }}</span>
                  </p>
                </div>
                <span
                  class="shrink-0 self-start pt-1 text-label-small whitespace-nowrap text-on-surface-variant"
                  :title="`Since ${absoluteTime(entry.since)}`"
                  >{{ relativeTime(entry.since) }}</span
                >
              </button>
            </li>
          </ul>
        </StateBlock>
      </div>
    </section>

    <!-- Two columns from the expanded class however narrow a docked sheet makes them, so opening
         a member never moves the channels. -->
    <div class="grid items-start gap-6 expanded:grid-cols-2">
      <section aria-labelledby="voice-members">
        <div class="section-header">
          <h2 id="voice-members" class="text-title-medium">Most time in voice</h2>
        </div>
        <div :class="!loading && members.length === 0 && 'card'">
          <StateBlock
            :loading="loading"
            :error="overview.error.value"
            :empty="members.length === 0"
            empty-text="Nobody spent time in voice in this period."
            compact
          >
            <template #skeleton>
              <SkeletonList :rows="5" rank two-line trailing="text" />
            </template>
            <ol class="segmented-list">
              <li v-for="(member, index) in members" :key="member.id" class="segmented-item p-0">
                <button
                  type="button"
                  class="state-layer flex min-h-14 w-full min-w-0 cursor-pointer items-center gap-4 rounded-[inherit] px-4 py-2 text-left transition-colors duration-200 ease-effects-fast"
                  :class="
                    member.id === chosenMember &&
                    'bg-secondary-container text-on-secondary-container'
                  "
                  :aria-current="member.id === chosenMember ? 'true' : undefined"
                  @click="chooseMember(member.id)"
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
                      {{ plural(member.sessions, 'session', 'sessions') }}
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
                </button>
              </li>
            </ol>
          </StateBlock>
        </div>
      </section>

      <section aria-labelledby="voice-channels">
        <div class="section-header">
          <h2 id="voice-channels" class="text-title-medium">Busiest channels</h2>
        </div>
        <div :class="!loading && channels.length === 0 && 'card'">
          <StateBlock
            :loading="loading"
            :error="overview.error.value"
            :empty="channels.length === 0"
            empty-text="No voice channels used in this period."
            compact
          >
            <template #skeleton>
              <SkeletonList :rows="5" leading="art" two-line trailing="text" />
            </template>
            <ol class="segmented-list">
              <li v-for="channel in channels" :key="channel.id" class="segmented-item">
                <span
                  class="grid size-10 shrink-0 place-items-center rounded-sm bg-surface-container-highest text-on-surface-variant"
                  aria-hidden="true"
                  ><span class="icon [--icon-size:20px]">volume_up</span></span
                >
                <div class="min-w-0 flex-1 py-1">
                  <p class="truncate text-body-large" :title="channel.name">{{ channel.name }}</p>
                  <div class="flex items-center gap-2">
                    <span class="flex -space-x-1.5">
                      <img
                        v-for="member in channel.top"
                        :key="member.id"
                        class="size-5 rounded-full bg-surface-container-highest object-cover ring-2 ring-surface-container"
                        :src="member.avatarUrl"
                        :alt="member.displayName"
                        :title="`${member.displayName} · ${formatDuration(member.ms)}`"
                        width="20"
                        height="20"
                      />
                    </span>
                    <span class="truncate text-body-small text-on-surface-variant">{{
                      plural(channel.members, 'member', 'members')
                    }}</span>
                  </div>
                </div>
                <span class="shrink-0 text-body-large tabular-nums">{{
                  formatDuration(channel.ms)
                }}</span>
              </li>
            </ol>
          </StateBlock>
        </div>
      </section>
    </div>

    <SupportingSheet v-model:open="sheetOpen" :headline="sheetPerson?.displayName ?? ''">
      <template #leading>
        <img
          v-if="sheetPerson"
          class="size-14 shrink-0 rounded-full bg-surface-container-highest object-cover"
          :src="sheetPerson.avatarUrl"
          alt=""
          width="56"
          height="56"
        />
        <span
          v-else
          class="grid size-14 shrink-0 place-items-center rounded-full bg-surface-container-highest text-on-surface-variant"
          aria-hidden="true"
          ><span class="icon">headset_mic</span></span
        >
      </template>
      <template v-if="detail" #supporting>
        {{ formatDuration(detail.ms) }} · {{ plural(detail.sessions, 'session', 'sessions') }} ·
        {{ periodLabel }}
      </template>
      <div class="flex flex-col gap-4">
        <p
          v-if="detail?.now"
          class="card flex items-center gap-3 bg-tertiary-container px-4 py-3 text-body-medium text-on-tertiary-container"
        >
          <span class="icon [--icon-size:20px]" aria-hidden="true">volume_up</span>
          <span class="min-w-0 flex-1 truncate"
            >In <strong class="font-medium">{{ detail.now.channel.name }}</strong></span
          >
          <span
            class="shrink-0 text-label-small"
            :title="`Since ${absoluteTime(detail.now.since)}`"
            >{{ relativeTime(detail.now.since) }}</span
          >
        </p>
        <StateBlock
          :loading="memberVoice.loading.value && !detail"
          :error="memberVoice.error.value"
          :empty="detail?.channels.length === 0"
          empty-text="No time in voice in this period."
          compact
        >
          <template #skeleton>
            <SkeletonList
              :rows="3"
              leading="art"
              two-line
              trailing="text"
              item-class="bg-surface-container-high"
            />
          </template>
          <ol class="segmented-list">
            <li
              v-for="channel in detail?.channels"
              :key="channel.id"
              class="segmented-item bg-surface-container-high"
            >
              <span
                class="grid size-10 shrink-0 place-items-center rounded-sm bg-surface-container-highest text-on-surface-variant"
                aria-hidden="true"
                ><span class="icon [--icon-size:20px]">volume_up</span></span
              >
              <div class="min-w-0 flex-1 py-1">
                <p class="truncate text-body-large" :title="channel.name">{{ channel.name }}</p>
                <p class="truncate text-body-small text-on-surface-variant">
                  {{ plural(channel.sessions, 'session', 'sessions') }}
                </p>
              </div>
              <span class="shrink-0 text-body-large tabular-nums">{{
                formatDuration(channel.ms)
              }}</span>
            </li>
          </ol>
        </StateBlock>
      </div>
    </SupportingSheet>
  </div>
</template>
