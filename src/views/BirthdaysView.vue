<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'

import AppDatePicker from '@/components/AppDatePicker.vue'
import AppDialog from '@/components/AppDialog.vue'
import AppSelect from '@/components/AppSelect.vue'
import PlanaPortrait from '@/components/PlanaPortrait.vue'
import StateBlock from '@/components/StateBlock.vue'
import { apiFetch } from '@/lib/api'
import { formatMonthDay } from '@/lib/dates'
import { discordTextColor, roleColor } from '@/lib/discord'
import type { SelectOption } from '@/lib/select'
import { useAsync } from '@/lib/useAsync'
import { useSettingsStore } from '@/stores/settings'

type BirthdayMember = {
  id: string
  username: string
  displayName: string
  /** Their name's colour in Discord (highest coloured role); #000000 for none. */
  color?: string
  avatarUrl: string
}

type BirthdayEntry = BirthdayMember & { month: number; day: number; daysUntil: number }

type BirthdayOverview = {
  birthdays: BirthdayEntry[]
  members: BirthdayMember[]
  timeZone: string
}

const settings = useSettingsStore()
const overview = useAsync(() => apiFetch<BirthdayOverview>('/api/birthdays'))

const memberId = ref<string | null>(null)
const month = ref<number | null>(null)
const day = ref<number | null>(null)

const busy = ref(false)
const actionError = ref<string | null>(null)
const notice = ref<string | null>(null)

/** The remove dialog, and the birthday it asks about (kept while it animates closed). */
const removeOpen = ref(false)
const removing = ref<BirthdayEntry | null>(null)

function confirmRemove(entry: BirthdayEntry) {
  removing.value = entry
  removeOpen.value = true
}

onMounted(() => {
  void settings.load()
  void overview.run()
})

const birthdays = computed(() => overview.data.value?.birthdays ?? [])
const members = computed(() => overview.data.value?.members ?? [])
const byMember = computed(() => new Map(birthdays.value.map((entry) => [entry.id, entry])))

const existing = computed(() => (memberId.value ? byMember.value.get(memberId.value) : undefined))

const memberOptions = computed<SelectOption<string | null>[]>(() =>
  members.value.map((member) => {
    const saved = byMember.value.get(member.id)
    return {
      value: member.id,
      label: member.displayName,
      swatch: roleColor(member.color),
      trailing: saved ? `${member.username} · ${formatDate(saved)}` : member.username,
    }
  }),
)

// Picking a member who already has a birthday loads it, so the form edits it in place.
watch(memberId, () => {
  month.value = existing.value?.month ?? null
  day.value = existing.value?.day ?? null
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
  return formatMonthDay(entry.month, entry.day)
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

async function remove() {
  const entry = removing.value
  removeOpen.value = false
  if (!entry) return

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
  <div class="flex flex-col gap-4">
    <div v-if="settings.loaded && !settings.settings.birthdayChannelId" class="alert alert-warn">
      Birthday announcements are off until a birthday channel is chosen. Birthdays saved here are
      kept for when they are switched on.
      <RouterLink to="/settings" class="font-medium underline underline-offset-2"
        >Choose a channel →</RouterLink
      >
    </div>

    <p v-if="actionError" class="alert alert-error">{{ actionError }}</p>
    <p v-else-if="notice" class="alert alert-success">{{ notice }}</p>

    <section aria-labelledby="birthday-form">
      <div class="section-header">
        <div>
          <h2 id="birthday-form" class="text-title-medium">
            {{ existing ? 'Change a birthday' : 'Add a birthday' }}
          </h2>
          <p class="text-body-medium text-on-surface-variant">
            Only the month and day are stored. Members can also use <code>/birthday set</code>.
          </p>
        </div>
      </div>

      <form
        class="card card-body flex flex-col gap-4 expanded:flex-row expanded:items-end"
        @submit.prevent="save"
      >
        <AppSelect
          v-model="memberId"
          class="min-w-0 flex-1"
          label="Member"
          :options="memberOptions"
          :disabled="overview.loading.value && members.length === 0"
        />

        <AppDatePicker
          v-model:month="month"
          v-model:day="day"
          class="expanded:w-56"
          label="Birthday"
          :disabled="!memberId"
        />

        <div class="flex h-14 items-center gap-2.5">
          <button class="btn btn-filled" type="submit" :disabled="!canSave">
            {{ busy ? 'Saving…' : 'Save' }}
          </button>
          <button
            v-if="memberId"
            class="btn btn-text"
            type="button"
            :disabled="busy"
            @click="clearForm"
          >
            Cancel
          </button>
        </div>
      </form>
    </section>

    <section aria-labelledby="birthday-list">
      <div class="section-header">
        <div>
          <h2 id="birthday-list" class="text-title-medium">Saved birthdays</h2>
          <p class="text-body-medium text-on-surface-variant">
            Soonest first. Announced just after midnight
            <template v-if="overview.data.value">({{ overview.data.value.timeZone }})</template>.
          </p>
        </div>
        <span v-if="birthdays.length > 0" class="chip">{{ birthdays.length }}</span>
      </div>

      <!-- Loading, empty and error states sit in one item-coloured block in place of the list. -->
      <div :class="birthdays.length === 0 && 'rounded-lg bg-surface-container'">
        <StateBlock
          :loading="overview.loading.value && birthdays.length === 0"
          :error="overview.error.value"
          :empty="birthdays.length === 0"
          empty-text="No birthdays yet. I'll remember each one I'm told."
          empty-mood="curious"
          :retry="overview.run"
        >
          <template #empty>Members add theirs with <code>/birthday set</code>.</template>
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
                <span class="text-body-large">{{ formatDate(entry) }}</span>
                <span v-if="entry.daysUntil === 0" class="chip chip-tertiary">Today</span>
                <span v-else class="text-label-small text-on-surface-variant">{{
                  formatUntil(entry.daysUntil)
                }}</span>
              </div>

              <div class="flex shrink-0 gap-2">
                <button
                  class="icon-btn icon-btn-tonal icon-btn-narrow"
                  type="button"
                  :aria-label="`Edit ${entry.displayName}'s birthday`"
                  title="Edit"
                  :disabled="busy"
                  @click="edit(entry)"
                >
                  <span class="icon [--icon-size:20px]" aria-hidden="true">edit</span>
                </button>
                <button
                  class="icon-btn icon-btn-tonal icon-btn-danger icon-btn-narrow"
                  type="button"
                  :aria-label="`Remove ${entry.displayName}'s birthday`"
                  title="Remove"
                  :disabled="busy"
                  @click="confirmRemove(entry)"
                >
                  <span class="icon [--icon-size:20px]" aria-hidden="true">delete</span>
                </button>
              </div>
            </li>
          </ul>
        </StateBlock>
      </div>
    </section>

    <AppDialog v-model:open="removeOpen" headline="Remove birthday?">
      <template #hero><PlanaPortrait mood="attentive" /></template>
      {{ removing?.displayName }}'s birthday will be deleted and won't be announced.
      <template #actions>
        <button class="btn btn-text" type="button" @click="removeOpen = false">Cancel</button>
        <button class="btn btn-text" type="button" @click="remove">Remove</button>
      </template>
    </AppDialog>
  </div>
</template>
