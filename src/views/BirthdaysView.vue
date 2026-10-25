<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'

import StateBlock from '@/components/StateBlock.vue'
import { apiFetch } from '@/lib/api'
import { useAsync } from '@/lib/useAsync'
import { useSettingsStore } from '@/stores/settings'

type BirthdayMember = {
  id: string
  username: string
  displayName: string
  avatarUrl: string
}

type BirthdayEntry = BirthdayMember & { month: number; day: number; daysUntil: number }

type BirthdayOverview = {
  birthdays: BirthdayEntry[]
  members: BirthdayMember[]
  timeZone: string
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

/** February counts as 29 so a leap-day birthday can be saved. */
const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

const settings = useSettingsStore()
const overview = useAsync(() => apiFetch<BirthdayOverview>('/api/birthdays'))

const memberId = ref<string | null>(null)
const month = ref<number | null>(null)
const day = ref<number | null>(null)

const busy = ref(false)
const actionError = ref<string | null>(null)
const notice = ref<string | null>(null)

onMounted(() => {
  void settings.load()
  void overview.run()
})

const birthdays = computed(() => overview.data.value?.birthdays ?? [])
const members = computed(() => overview.data.value?.members ?? [])
const byMember = computed(() => new Map(birthdays.value.map((entry) => [entry.id, entry])))

const existing = computed(() => (memberId.value ? byMember.value.get(memberId.value) : undefined))
const dayOptions = computed(() => (month.value ? DAYS_IN_MONTH[month.value - 1]! : 31))

// Picking a member who already has a birthday loads it, so the form edits it in place.
watch(memberId, () => {
  month.value = existing.value?.month ?? null
  day.value = existing.value?.day ?? null
})

// Moving from March 31 to April would otherwise leave an impossible date selected.
watch(month, () => {
  if (day.value != null && day.value > dayOptions.value) day.value = null
})

const canSave = computed(
  () =>
    memberId.value != null &&
    month.value != null &&
    day.value != null &&
    !busy.value &&
    (existing.value?.month !== month.value || existing.value?.day !== day.value),
)

function formatDate(entry: { month: number; day: number }): string {
  return `${MONTHS[entry.month - 1]} ${entry.day}`
}

function formatUntil(days: number): string {
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  return `In ${days} days`
}

function edit(entry: BirthdayEntry) {
  memberId.value = entry.id
  notice.value = null
  actionError.value = null
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function clearForm() {
  memberId.value = null
}

async function save() {
  if (!memberId.value || month.value == null || day.value == null) return

  const member = members.value.find((candidate) => candidate.id === memberId.value)
  busy.value = true
  actionError.value = null
  notice.value = null
  try {
    await apiFetch(`/api/birthdays/${memberId.value}`, {
      method: 'PUT',
      body: { month: month.value, day: day.value },
    })
    const whose = member ? `${member.displayName}'s` : 'the'
    notice.value = `Saved ${whose} birthday as ${formatDate({ month: month.value, day: day.value })}.`
    await overview.run()
    clearForm()
  } catch (cause) {
    actionError.value = cause instanceof Error ? cause.message : 'Could not save the birthday.'
  } finally {
    busy.value = false
  }
}

async function remove(entry: BirthdayEntry) {
  if (!window.confirm(`Remove ${entry.displayName}'s birthday?`)) return

  busy.value = true
  actionError.value = null
  notice.value = null
  try {
    await apiFetch(`/api/birthdays/${entry.id}`, { method: 'DELETE' })
    notice.value = `Removed ${entry.displayName}'s birthday.`
    if (memberId.value === entry.id) clearForm()
    await overview.run()
  } catch (cause) {
    actionError.value = cause instanceof Error ? cause.message : 'Could not remove the birthday.'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-5">
    <div v-if="settings.loaded && !settings.settings.birthdayChannelId" class="alert alert-warn">
      Birthday announcements are off until a birthday channel is chosen. Birthdays saved here are
      kept for when they are switched on.
      <RouterLink to="/settings" class="underline">Choose a channel →</RouterLink>
    </div>

    <p v-if="actionError" class="alert alert-error">{{ actionError }}</p>
    <p v-else-if="notice" class="alert alert-success">{{ notice }}</p>

    <div class="rounded-lg border border-line bg-surface">
      <div class="border-b border-line px-5 py-4">
        <p class="text-[15px] font-semibold">
          {{ existing ? 'Change a birthday' : 'Add a birthday' }}
        </p>
        <p class="text-[13px] text-faint">
          Only the month and day are stored. Members can also use <code>/birthday set</code>.
        </p>
      </div>

      <form class="flex flex-col gap-4 p-5 md:flex-row md:items-end" @submit.prevent="save">
        <div class="flex min-w-0 flex-1 flex-col gap-1.5">
          <label class="text-[13px] font-semibold" for="birthday-member">Member</label>
          <select
            id="birthday-member"
            v-model="memberId"
            class="select"
            :disabled="overview.loading.value && members.length === 0"
          >
            <option :value="null">Choose a member</option>
            <option v-for="member in members" :key="member.id" :value="member.id">
              {{ member.displayName }} ({{ member.username }}){{
                byMember.has(member.id) ? ` — ${formatDate(byMember.get(member.id)!)}` : ''
              }}
            </option>
          </select>
        </div>

        <div class="flex gap-4">
          <div class="flex flex-col gap-1.5">
            <label class="text-[13px] font-semibold" for="birthday-month">Month</label>
            <select id="birthday-month" v-model="month" class="select" :disabled="!memberId">
              <option :value="null" disabled>Month</option>
              <option v-for="(name, index) in MONTHS" :key="name" :value="index + 1">
                {{ name }}
              </option>
            </select>
          </div>

          <div class="flex flex-col gap-1.5">
            <label class="text-[13px] font-semibold" for="birthday-day">Day</label>
            <select id="birthday-day" v-model="day" class="select" :disabled="!memberId">
              <option :value="null" disabled>Day</option>
              <option v-for="value in dayOptions" :key="value" :value="value">{{ value }}</option>
            </select>
          </div>
        </div>

        <div class="flex gap-2.5">
          <button class="btn btn-primary" type="submit" :disabled="!canSave">
            {{ busy ? 'Saving…' : 'Save' }}
          </button>
          <button
            v-if="memberId"
            class="btn btn-ghost"
            type="button"
            :disabled="busy"
            @click="clearForm"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>

    <div class="rounded-lg border border-line bg-surface">
      <div class="flex items-center justify-between gap-4 border-b border-line px-5 py-4">
        <div>
          <p class="text-[15px] font-semibold">Saved birthdays</p>
          <p class="text-[13px] text-faint">
            Soonest first. Announced just after midnight
            <template v-if="overview.data.value">({{ overview.data.value.timeZone }})</template>.
          </p>
        </div>
        <span v-if="birthdays.length > 0" class="badge">{{ birthdays.length }}</span>
      </div>

      <StateBlock
        :loading="overview.loading.value && birthdays.length === 0"
        :error="overview.error.value"
        :empty="birthdays.length === 0"
        empty-text="No birthdays saved yet."
      >
        <div class="overflow-x-auto">
          <table class="w-full border-collapse">
            <thead>
              <tr
                class="[&>th]:border-b [&>th]:border-line [&>th]:px-5 [&>th]:py-2.5 [&>th]:text-left [&>th]:text-xs [&>th]:font-semibold [&>th]:tracking-wider [&>th]:text-faint [&>th]:uppercase"
              >
                <th>Member</th>
                <th>Birthday</th>
                <th>Next</th>
                <th class="!text-right">Actions</th>
              </tr>
            </thead>
            <tbody
              class="[&>tr:last-child>td]:border-b-0 [&>tr>td]:border-b [&>tr>td]:border-line [&>tr>td]:px-5 [&>tr>td]:py-3 [&>tr>td]:align-middle"
            >
              <tr v-for="entry in birthdays" :key="entry.id">
                <td>
                  <div class="flex items-center gap-[11px]">
                    <img
                      class="shrink-0 rounded-full bg-raised object-cover"
                      :src="entry.avatarUrl"
                      :alt="entry.displayName"
                      width="34"
                      height="34"
                    />
                    <div class="flex flex-col leading-tight">
                      <span class="font-medium">{{ entry.displayName }}</span>
                      <span class="font-mono text-xs text-muted">{{ entry.username }}</span>
                    </div>
                  </div>
                </td>
                <td>{{ formatDate(entry) }}</td>
                <td>
                  <span v-if="entry.daysUntil === 0" class="badge badge-success">Today 🎉</span>
                  <span v-else>{{ formatUntil(entry.daysUntil) }}</span>
                </td>
                <td class="text-right">
                  <div class="inline-flex justify-end gap-2">
                    <button class="btn btn-secondary btn-sm" :disabled="busy" @click="edit(entry)">
                      Edit
                    </button>
                    <button class="btn btn-ghost btn-sm" :disabled="busy" @click="remove(entry)">
                      Remove
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </StateBlock>
    </div>
  </div>
</template>
