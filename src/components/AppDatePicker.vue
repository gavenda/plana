<script setup lang="ts">
import { computed, nextTick, ref, useId } from 'vue'

import OutlinedField from '@/components/OutlinedField.vue'
import { daysIn, firstWeekday, formatMonthDay, MONTHS, parseMonthDay } from '@/lib/dates'

/**
 * M3 modal date picker for a date without a year (a birthday): an outlined field that opens the
 * picker in a dialog, with a calendar of one month at a time, a month menu in place of M3's
 * month-and-year menu, and an input mode for typing the date. Nothing changes until OK.
 */
const props = defineProps<{
  label: string
  disabled?: boolean
  supportingText?: string
}>()

const month = defineModel<number | null>('month', { required: true })
const day = defineModel<number | null>('day', { required: true })

const id = useId()
const labelId = `${id}-label`
const headlineId = `${id}-headline`
const supportingId = `${id}-supporting`
const inputId = `${id}-input`

const WEEKDAYS = [
  { short: 'S', long: 'Sunday' },
  { short: 'M', long: 'Monday' },
  { short: 'T', long: 'Tuesday' },
  { short: 'W', long: 'Wednesday' },
  { short: 'T', long: 'Thursday' },
  { short: 'F', long: 'Friday' },
  { short: 'S', long: 'Saturday' },
]

const SHORT_MONTHS = MONTHS.map((name) => name.slice(0, 3))

const dialog = ref<HTMLDialogElement | null>(null)
const grid = ref<HTMLElement | null>(null)
const field = ref<HTMLButtonElement | null>(null)
const textInput = ref<HTMLInputElement | null>(null)
const focused = ref(false)
const inputFocused = ref(false)

const value = computed(() =>
  month.value != null && day.value != null ? formatMonthDay(month.value, day.value) : '',
)

// ---------------------------------------------------------------- draft ---

/** The date chosen in the dialog, kept apart from the model until OK. */
const draftMonth = ref<number | null>(null)
const draftDay = ref<number | null>(null)
/** The month the calendar shows, and the day that holds keyboard focus in it. */
const viewMonth = ref(1)
const focusDay = ref(1)
const mode = ref<'calendar' | 'input'>('calendar')
const view = ref<'days' | 'months'>('days')
const text = ref('')
const inputError = ref<string | null>(null)

const today = new Date()
const todayMonth = today.getMonth() + 1
const todayDay = today.getDate()

const headline = computed(() =>
  draftMonth.value != null && draftDay.value != null
    ? `${SHORT_MONTHS[draftMonth.value - 1]} ${draftDay.value}`
    : 'Month and day',
)

function asText(m: number | null, d: number | null): string {
  if (m == null || d == null) return ''
  return `${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')}`
}

function openPicker() {
  if (props.disabled) return
  draftMonth.value = month.value
  draftDay.value = day.value
  viewMonth.value = month.value ?? todayMonth
  focusDay.value = day.value ?? (viewMonth.value === todayMonth ? todayDay : 1)
  mode.value = 'calendar'
  view.value = 'days'
  text.value = asText(month.value, day.value)
  inputError.value = null
  dialog.value?.showModal()
  void focusGridDay()
}

function close() {
  dialog.value?.close()
}

function confirm() {
  if (mode.value === 'input' && !readText()) return
  if (draftMonth.value == null || draftDay.value == null) return
  month.value = draftMonth.value
  day.value = draftDay.value
  close()
}

/** A click on the dialog element itself, not its content, is a click on the scrim. */
function onDialogClick(event: MouseEvent) {
  if (event.target === dialog.value) close()
}

function onDialogClose() {
  field.value?.focus()
}

// ------------------------------------------------------------- calendar ---

/** The shown month as weeks of seven cells, null where a cell is outside the month. */
const weeks = computed(() => {
  const cells: (number | null)[] = Array.from({ length: firstWeekday(viewMonth.value) }, () => null)
  for (let d = 1; d <= daysIn(viewMonth.value); d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)
  const rows: (number | null)[][] = []
  for (let index = 0; index < cells.length; index += 7) rows.push(cells.slice(index, index + 7))
  return rows
})

function shiftMonth(by: number) {
  viewMonth.value = ((viewMonth.value - 1 + by + 12) % 12) + 1
  focusDay.value = Math.min(focusDay.value, daysIn(viewMonth.value))
}

function selectDay(d: number) {
  draftMonth.value = viewMonth.value
  draftDay.value = d
  focusDay.value = d
}

function chooseMonth(m: number) {
  viewMonth.value = m
  focusDay.value = Math.min(focusDay.value, daysIn(m))
  view.value = 'days'
  void focusGridDay()
}

async function focusGridDay() {
  await nextTick()
  grid.value?.querySelector<HTMLButtonElement>(`[data-day="${focusDay.value}"]`)?.focus()
}

/** Arrow keys move by day and week, across months; Home and End go to the week's ends. */
function onGridKeydown(event: KeyboardEvent) {
  let target = focusDay.value
  const weekday = (firstWeekday(viewMonth.value) + focusDay.value - 1) % 7
  switch (event.key) {
    case 'ArrowLeft':
      target -= 1
      break
    case 'ArrowRight':
      target += 1
      break
    case 'ArrowUp':
      target -= 7
      break
    case 'ArrowDown':
      target += 7
      break
    case 'Home':
      target -= weekday
      break
    case 'End':
      target += 6 - weekday
      break
    case 'PageUp':
      event.preventDefault()
      shiftMonth(-1)
      void focusGridDay()
      return
    case 'PageDown':
      event.preventDefault()
      shiftMonth(1)
      void focusGridDay()
      return
    default:
      return
  }
  event.preventDefault()

  if (event.key === 'Home' || event.key === 'End') {
    target = Math.min(Math.max(target, 1), daysIn(viewMonth.value))
  } else if (target < 1) {
    shiftMonth(-1)
    target += daysIn(viewMonth.value)
  } else if (target > daysIn(viewMonth.value)) {
    target -= daysIn(viewMonth.value)
    shiftMonth(1)
  }
  focusDay.value = target
  void focusGridDay()
}

// ---------------------------------------------------------------- input ---

/** Reads the typed date into the draft; false, with an error shown, if it is not a date. */
function readText(): boolean {
  const parsed = parseMonthDay(text.value)
  if (!parsed) {
    inputError.value = text.value.trim() ? 'Not a valid date. Use MM/DD.' : 'Enter a date.'
    return false
  }
  inputError.value = null
  draftMonth.value = parsed.month
  draftDay.value = parsed.day
  return true
}

async function toggleMode() {
  if (mode.value === 'calendar') {
    text.value = asText(draftMonth.value, draftDay.value)
    inputError.value = null
    mode.value = 'input'
    await nextTick()
    textInput.value?.focus()
    return
  }
  if (text.value.trim() && !readText()) return
  if (draftMonth.value != null && draftDay.value != null) {
    viewMonth.value = draftMonth.value
    focusDay.value = draftDay.value
  }
  mode.value = 'calendar'
  view.value = 'days'
  void focusGridDay()
}
</script>

<template>
  <div>
    <OutlinedField
      :label="label"
      :label-id="labelId"
      :populated="value !== ''"
      :focused="focused"
      :disabled="disabled"
      :supporting-text="supportingText"
      :supporting-id="supportingId"
    >
      <button
        ref="field"
        type="button"
        class="flex h-14 w-full cursor-pointer items-center rounded-xs bg-transparent pr-12 pl-4 text-left text-body-large text-on-surface focus-visible:outline-none disabled:cursor-not-allowed disabled:text-on-surface/38"
        :disabled="disabled"
        aria-haspopup="dialog"
        :aria-labelledby="labelId"
        :aria-describedby="supportingText ? supportingId : undefined"
        @focus="focused = true"
        @blur="focused = false"
        @click="openPicker"
      >
        <span class="truncate">{{ value }}</span>
      </button>
      <span
        class="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 icon"
        :class="disabled ? 'text-on-surface/38' : 'text-on-surface-variant'"
        aria-hidden="true"
        >calendar_today</span
      >
    </OutlinedField>

    <dialog
      ref="dialog"
      :aria-labelledby="headlineId"
      class="m-auto w-[360px] max-w-[calc(100vw-48px)] scale-90 rounded-xl bg-surface-container-high p-0 text-on-surface opacity-0 shadow-level3 transition-[scale,opacity,display,overlay] transition-discrete duration-200 ease-effects backdrop:bg-scrim/32 open:scale-100 open:opacity-100 open:duration-500 open:ease-spatial starting:open:scale-90 starting:open:opacity-0"
      @click="onDialogClick"
      @close="onDialogClose"
    >
      <!-- Header: what is being picked, the chosen date, and the switch between calendar and typing. -->
      <div class="flex flex-col gap-9 pt-4 pr-3 pb-3 pl-6">
        <p :id="headlineId" class="text-label-large text-on-surface-variant">
          {{ mode === 'calendar' ? 'Select date' : 'Enter date' }}
        </p>
        <div class="flex items-center justify-between gap-2">
          <p
            class="text-headline-large"
            :class="draftDay == null && 'text-on-surface-variant'"
            aria-live="polite"
          >
            {{ headline }}
          </p>
          <button
            type="button"
            class="icon-btn"
            :aria-label="mode === 'calendar' ? 'Switch to typing' : 'Switch to calendar'"
            :title="mode === 'calendar' ? 'Switch to typing' : 'Switch to calendar'"
            @click="toggleMode"
          >
            <span class="icon" aria-hidden="true">{{
              mode === 'calendar' ? 'edit' : 'calendar_today'
            }}</span>
          </button>
        </div>
      </div>

      <div class="h-px bg-outline-variant" />

      <!-- Calendar mode. -->
      <div v-if="mode === 'calendar'" class="px-3 pt-1">
        <div class="flex h-12 items-center justify-between">
          <button
            type="button"
            class="btn btn-text gap-1 pr-2 pl-3 text-on-surface-variant"
            :aria-expanded="view === 'months'"
            @click="view = view === 'days' ? 'months' : 'days'"
          >
            {{ MONTHS[viewMonth - 1] }}
            <span
              class="icon transition-transform duration-350 ease-spatial-fast [--icon-size:18px]"
              :class="view === 'months' && 'rotate-180'"
              aria-hidden="true"
              >arrow_drop_down</span
            >
          </button>

          <div v-if="view === 'days'" class="flex">
            <button
              type="button"
              class="icon-btn"
              aria-label="Previous month"
              title="Previous month"
              @click="shiftMonth(-1)"
            >
              <span class="icon" aria-hidden="true">chevron_left</span>
            </button>
            <button
              type="button"
              class="icon-btn"
              aria-label="Next month"
              title="Next month"
              @click="shiftMonth(1)"
            >
              <span class="icon" aria-hidden="true">chevron_right</span>
            </button>
          </div>
        </div>

        <table
          v-if="view === 'days'"
          ref="grid"
          role="grid"
          class="w-full table-fixed border-collapse"
          :aria-label="MONTHS[viewMonth - 1]"
          @keydown="onGridKeydown"
        >
          <thead>
            <tr>
              <th
                v-for="(weekday, index) in WEEKDAYS"
                :key="index"
                scope="col"
                :abbr="weekday.long"
                class="h-12 text-body-large font-normal text-on-surface"
              >
                {{ weekday.short }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(week, row) in weeks" :key="`${viewMonth}-${row}`">
              <td
                v-for="(cell, column) in week"
                :key="column"
                class="h-12 p-0 text-center"
                :aria-selected="
                  cell != null ? viewMonth === draftMonth && cell === draftDay : undefined
                "
              >
                <button
                  v-if="cell != null"
                  type="button"
                  :data-day="cell"
                  :tabindex="cell === focusDay ? 0 : -1"
                  :aria-label="formatMonthDay(viewMonth, cell)"
                  :aria-current="viewMonth === todayMonth && cell === todayDay ? 'date' : undefined"
                  class="state-layer mx-auto grid size-10 cursor-pointer place-items-center rounded-full text-body-large transition-[border-radius] duration-350 ease-spatial-fast focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:rounded-md"
                  :class="
                    viewMonth === draftMonth && cell === draftDay
                      ? 'bg-primary text-on-primary'
                      : viewMonth === todayMonth && cell === todayDay
                        ? 'border border-primary text-primary'
                        : 'text-on-surface'
                  "
                  @click="selectDay(cell)"
                >
                  {{ cell }}
                </button>
              </td>
            </tr>
            <!-- Every month takes six rows, so the dialog keeps one height as you page through. -->
            <tr v-for="row in 6 - weeks.length" :key="`pad-${row}`" aria-hidden="true">
              <td class="h-12" colspan="7" />
            </tr>
          </tbody>
        </table>

        <!-- The month menu, in the calendar's place, as M3 shows its year menu. -->
        <div
          v-else
          class="grid h-[336px] grid-cols-3 content-start gap-x-2 gap-y-4 px-3 pt-4"
          role="listbox"
          aria-label="Month"
        >
          <button
            v-for="(name, index) in MONTHS"
            :key="name"
            type="button"
            role="option"
            :aria-selected="viewMonth === index + 1"
            class="state-layer h-9 cursor-pointer rounded-full text-body-large transition-[border-radius] duration-350 ease-spatial-fast active:rounded-md"
            :class="
              viewMonth === index + 1
                ? 'bg-primary text-on-primary'
                : index + 1 === todayMonth
                  ? 'border border-primary text-primary'
                  : 'text-on-surface-variant'
            "
            @click="chooseMonth(index + 1)"
          >
            {{ SHORT_MONTHS[index] }}
          </button>
        </div>
      </div>

      <!-- Input mode: the date typed as MM/DD. -->
      <form v-else class="px-6 pt-4 pb-2" @submit.prevent="confirm">
        <OutlinedField
          label="Date"
          :label-id="`${inputId}-label`"
          :control-id="inputId"
          :populated="text !== ''"
          :focused="inputFocused"
          :invalid="inputError != null"
          :supporting-text="inputError ?? 'MM/DD'"
          :supporting-id="`${inputId}-supporting`"
        >
          <input
            :id="inputId"
            ref="textInput"
            v-model="text"
            type="text"
            inputmode="numeric"
            autocomplete="off"
            placeholder="MM/DD"
            maxlength="5"
            class="h-14 w-full rounded-xs bg-transparent px-4 text-body-large text-on-surface placeholder:text-on-surface-variant focus-visible:outline-none"
            :aria-invalid="inputError != null"
            :aria-describedby="`${inputId}-supporting`"
            @input="inputError = null"
            @focus="inputFocused = true"
            @blur="inputFocused = false"
          />
        </OutlinedField>
      </form>

      <div class="flex justify-end gap-2 px-3 pt-2 pb-3">
        <button class="btn btn-text" type="button" @click="close">Cancel</button>
        <button
          class="btn btn-text"
          type="button"
          :disabled="mode === 'calendar' && draftDay == null"
          @click="confirm"
        >
          OK
        </button>
      </div>
    </dialog>
  </div>
</template>
