<script setup lang="ts">
import { computed, onMounted, ref, useId, watch } from 'vue'
import { RouterLink } from 'vue-router'

import AppDatePicker from '@/components/AppDatePicker.vue'
import AppDialog from '@/components/AppDialog.vue'
import AppSelect from '@/components/AppSelect.vue'
import PlanaPortrait from '@/components/PlanaPortrait.vue'
import SkeletonList from '@/components/SkeletonList.vue'
import StateBlock from '@/components/StateBlock.vue'
import { apiFetch } from '@/lib/api'
import { formatUntil, type BirthdayEntry, type BirthdayOverview } from '@/lib/birthdays'
import { formatMonthDay } from '@/lib/dates'
import { discordTextColor, roleColor } from '@/lib/discord'
import { useRailFab } from '@/lib/rail'
import type { SelectOption } from '@/lib/select'
import { useSnackbar } from '@/lib/snackbar'
import { useAsync } from '@/lib/useAsync'
import { useSessionStore } from '@/stores/session'
import { useSettingsStore } from '@/stores/settings'

const settings = useSettingsStore()
const session = useSessionStore()
const overview = useAsync(() => apiFetch<BirthdayOverview>('/api/birthdays'))

/** The add or change dialog, and what it holds. */
const formOpen = ref(false)
const formId = useId()
const memberId = ref<string | null>(null)
const month = ref<number | null>(null)
const day = ref<number | null>(null)

const snackbar = useSnackbar()
const busy = ref(false)

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
const loading = computed(() => overview.data.value == null && overview.error.value == null)
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

/** Their saved date, or none, for whoever the form now names. */
function loadSaved() {
  month.value = existing.value?.month ?? null
  day.value = existing.value?.day ?? null
}

/** Picking a member who already has a birthday loads it, so the form changes it in place. */
function pickMember(id: string | null) {
  memberId.value = id
  loadSaved()
}

/** Opens the form empty, on one member's saved birthday, or on a date given. */
function openForm(id: string | null = null, date?: { month: number; day: number }) {
  pickMember(id)
  if (date) {
    month.value = date.month
    day.value = date.day
  }
  formOpen.value = true
}

/** Set only while the dialog is open, so saving doesn't retitle it as it closes. */
const formHeadline = ref('Add birthday')
watch(
  [existing, formOpen],
  ([saved, open]) => {
    if (open) formHeadline.value = saved ? 'Change birthday' : 'Add birthday'
  },
  { immediate: true },
)

// The rail's "Add birthday".
useRailFab(() => openForm())

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

async function save() {
  if (!canSave.value || !memberId.value || month.value == null || day.value == null) return

  const id = memberId.value
  const date = { month: month.value, day: day.value }
  const member = members.value.find((candidate) => candidate.id === id)
  busy.value = true
  try {
    await apiFetch(`/api/birthdays/${id}`, { method: 'PUT', body: date })
    formOpen.value = false
    const whose = member ? `${member.displayName}'s` : 'the'
    snackbar.show(`Saved ${whose} birthday as ${formatDate(date)}.`)
    await overview.run()
  } catch (cause) {
    // The snackbar can't be reached past the dialog, so it closes, and "Try again" brings the
    // same answers back.
    formOpen.value = false
    snackbar.show(
      cause instanceof Error && cause.message ? cause.message : 'Could not save the birthday.',
      {
        error: true,
        action: {
          label: 'Try again',
          run: () => openForm(id, date),
        },
      },
    )
  } finally {
    busy.value = false
  }
}

async function remove() {
  const entry = removing.value
  removeOpen.value = false
  if (!entry) return

  busy.value = true
  try {
    await apiFetch(`/api/birthdays/${entry.id}`, { method: 'DELETE' })
    snackbar.show(`Removed ${entry.displayName}'s birthday.`)
    await overview.run()
  } catch (cause) {
    snackbar.showError(cause, 'Could not remove the birthday.')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div
      v-if="settings.loaded && !settings.settings.birthdayChannelId"
      class="card card-warn flex items-center gap-4 py-3 pr-3 pl-6"
    >
      <p class="min-w-0 flex-1 text-body-medium">
        Birthday announcements are off until a birthday channel is chosen. Birthdays saved here are
        kept for when they are switched on.
      </p>
      <RouterLink
        v-if="session.isAdmin"
        to="/settings"
        class="btn btn-text text-on-warning-container"
        >Choose a channel</RouterLink
      >
    </div>

    <section aria-labelledby="birthday-list">
      <div class="section-header">
        <h2 id="birthday-list" class="text-title-medium">Saved birthdays</h2>
        <span v-if="birthdays.length > 0" class="pr-4 text-label-large text-on-surface-variant">{{
          birthdays.length
        }}</span>
      </div>

      <!-- Loading, empty and error states sit in one card in place of the list. -->
      <div :class="!loading && birthdays.length === 0 && 'card'">
        <StateBlock
          :loading="loading"
          :error="overview.error.value"
          :empty="birthdays.length === 0"
          empty-text="No birthdays yet. I'll remember each one I'm told."
          empty-mood="curious"
          :retry="overview.run"
        >
          <template #empty>Members add theirs with <code>/birthday set</code>.</template>
          <template #skeleton><SkeletonList :rows="4" two-line trailing="stack" /></template>
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
                <span
                  class="text-label-small"
                  :class="entry.daysUntil === 0 ? 'text-tertiary' : 'text-on-surface-variant'"
                  >{{ formatUntil(entry.daysUntil) }}</span
                >
              </div>

              <div class="flex shrink-0 gap-2">
                <button
                  class="icon-btn icon-btn-tonal icon-btn-narrow"
                  type="button"
                  :aria-label="`Edit ${entry.displayName}'s birthday`"
                  title="Edit"
                  :disabled="busy"
                  @click="openForm(entry.id)"
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

    <!-- A form in a dialog has no hero and no face (see "Dialogs" in BRANDING.md). -->
    <AppDialog v-model:open="formOpen" :headline="formHeadline">
      <form :id="formId" class="flex flex-col gap-6 pt-2" @submit.prevent="save">
        <AppSelect
          :model-value="memberId"
          label="Member"
          :options="memberOptions"
          :disabled="loading"
          @update:model-value="pickMember"
        />
        <AppDatePicker
          v-model:month="month"
          v-model:day="day"
          label="Birthday"
          :disabled="!memberId"
        />
      </form>
      <template #actions>
        <button class="btn btn-text" type="button" :disabled="busy" @click="formOpen = false">
          Cancel
        </button>
        <button class="btn btn-text" type="submit" :form="formId" :disabled="!canSave">
          {{ busy ? 'Saving…' : 'Save' }}
        </button>
      </template>
    </AppDialog>

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
