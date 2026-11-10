<script setup lang="ts">
import { computed, onMounted, ref, useId, watch } from 'vue'
import { Button, Dialog, IconButton, List, ListItem } from 'tailwind-material3'

import AppDatePicker from '@/components/AppDatePicker.vue'
import AppSelect from '@/components/AppSelect.vue'
import LinkButton from '@/components/LinkButton.vue'
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
import { useLive } from '@/lib/live'
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

/** Another moderator's change, or a member's own `/birthday set`, shows without a reload. */
useLive('birthdays', () => {
  if (!loading.value) void overview.run()
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
      keywords: [member.username],
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
      class="flex items-center gap-4 overflow-hidden rounded-medium bg-warning-container py-3 pr-3 pl-6 text-on-warning-container"
    >
      <p class="min-w-0 flex-1 text-body-medium">
        Birthday announcements are off until a birthday channel is chosen. Birthdays saved here are
        kept for when they are switched on.
      </p>
      <LinkButton v-if="session.isAdmin" variant="inherit" to="/settings"
        >Choose a channel</LinkButton
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
      <div
        :class="
          !loading &&
          birthdays.length === 0 &&
          'overflow-hidden rounded-medium bg-surface-container'
        "
      >
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

              <span class="block truncate" :style="{ color: discordTextColor(entry.color) }">
                {{ entry.displayName }}
              </span>
              <template #supporting-text>
                <span class="block truncate font-mono text-body-small">{{ entry.username }}</span>
              </template>

              <template #trailing>
                <span class="flex items-center gap-4">
                  <span class="flex flex-col items-end">
                    <span class="text-body-large">{{ formatDate(entry) }}</span>
                    <span
                      class="text-label-small"
                      :class="entry.daysUntil === 0 ? 'text-tertiary' : 'text-on-surface-variant'"
                      >{{ formatUntil(entry.daysUntil) }}</span
                    >
                  </span>
                  <span class="flex gap-2">
                    <IconButton
                      variant="tonal"
                      width="narrow"
                      :label="`Edit ${entry.displayName}'s birthday`"
                      :disabled="busy"
                      @click="openForm(entry.id)"
                    >
                      <span class="icon [--icon-size:20px]" aria-hidden="true">edit</span>
                    </IconButton>
                    <IconButton
                      variant="tonal"
                      width="narrow"
                      class="bg-error-container! text-on-error-container!"
                      :label="`Remove ${entry.displayName}'s birthday`"
                      :disabled="busy"
                      @click="confirmRemove(entry)"
                    >
                      <span class="icon [--icon-size:20px]" aria-hidden="true">delete</span>
                    </IconButton>
                  </span>
                </span>
              </template>
            </ListItem>
          </List>
        </StateBlock>
      </div>
    </section>

    <!-- A form in a dialog has no hero and no face (see "Dialogs" in BRANDING.md). -->
    <Dialog v-model:open="formOpen">
      <template #headline>{{ formHeadline }}</template>
      <form
        :id="formId"
        class="flex w-[400px] max-w-full flex-col gap-6 pt-2"
        @submit.prevent="save"
      >
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
        <Button variant="text" :disabled="busy" @click="formOpen = false">Cancel</Button>
        <Button variant="text" type="submit" :form="formId" :disabled="!canSave">{{
          busy ? 'Saving…' : 'Save'
        }}</Button>
      </template>
    </Dialog>

    <Dialog v-model:open="removeOpen">
      <template #headline>Remove birthday?</template>
      <div class="flex flex-col items-center gap-4 text-center">
        <PlanaPortrait mood="attentive" />
        <p>{{ removing?.displayName }}'s birthday will be deleted and won't be announced.</p>
      </div>
      <template #actions>
        <Button variant="text" @click="removeOpen = false">Cancel</Button>
        <Button variant="text" @click="remove">Remove</Button>
      </template>
    </Dialog>
  </div>
</template>
