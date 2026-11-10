<script setup lang="ts" generic="T extends string | number | null">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'
import { TextField } from 'tailwind-material3'

import type { SelectOption } from '@/lib/select'

/**
 * M3 editable exposed dropdown menu: an outlined text field (tailwind-material3's TextField) that
 * opens a menu of options. The library's Menu moves focus into the menu, which a field you type
 * in can't do, so the menu here is its own listbox, drawn as an M3 menu.
 * Typing filters the menu; choosing an option (or Enter on the highlighted one) sets the value,
 * and leaving the field without choosing discards what was typed. Keyboard and screen reader
 * behaviour follow the WAI-ARIA combobox pattern with a list popup, with focus kept on the
 * field while the menu is open.
 */
const props = defineProps<{
  label: string
  options: SelectOption<T>[]
  disabled?: boolean
  supportingText?: string
}>()

const model = defineModel<T>({ required: true })

const id = useId()
const listboxId = `${id}-listbox`
const optionId = (index: number) => `${id}-option-${index}`

const textField = ref<InstanceType<typeof TextField> | null>(null)
/** The input itself, for focus and selection. */
const field = computed(() => (textField.value?.input as HTMLInputElement | null) ?? null)
/** The whole field, which the menu lines up with. */
const fieldBox = computed(() => (textField.value?.$el as HTMLElement | undefined) ?? null)
const menu = ref<HTMLElement | null>(null)

const open = ref(false)
const focused = ref(false)
const activeIndex = ref(-1)
const placement = ref<'bottom' | 'top'>('bottom')
const menuStyle = ref<Record<string, string>>({})

/** What has been typed to filter the menu; empty shows every option and the chosen label. */
const query = ref('')
/** Set by the first edit, so a field emptied by typing stays empty instead of showing the label. */
const editing = ref(false)

/** Ignores case and the leading symbols on names such as #channel. */
const plain = (text: string) => text.replace(/^[^\p{L}\p{N}]+/u, '').toLowerCase()

const shown = computed(() => {
  const wanted = plain(query.value.trim())
  if (!wanted) return props.options
  return props.options.filter((option) =>
    [option.label, ...(option.keywords ?? [])].some((text) => plain(text).includes(wanted)),
  )
})

// The menu is a popover, drawn in the top layer so neither card overflow nor a modal dialog
// covers it. It teleports into the dialog the field is in, if any, since everything outside an
// open modal dialog is inert, and to <body> otherwise. Teleport only after hydration, since the
// server render has no menu to match.
const mounted = ref(false)
const menuHost = ref<HTMLElement | string>('body')
onMounted(() => {
  menuHost.value = field.value?.closest('dialog') ?? 'body'
  mounted.value = true
})

/** Into the top layer as soon as it is in the page, so its opening transition plays there. */
function showMenu(el: Element) {
  if (el instanceof HTMLElement) el.showPopover?.()
}

const selectedIndex = computed(() =>
  shown.value.findIndex((option) => option.value === model.value),
)
const selected = computed(() => props.options.find((option) => option.value === model.value))

/** Runs of options sharing a group become labelled sections, like <optgroup>. */
const sections = computed(() => {
  const result: { group?: string; items: { option: SelectOption<T>; index: number }[] }[] = []
  shown.value.forEach((option, index) => {
    const last = result[result.length - 1]
    if (last && last.group === option.group) last.items.push({ option, index })
    else result.push({ group: option.group, items: [{ option, index }] })
  })
  return result
})

const isEnabled = (index: number) => {
  const option = shown.value[index]
  return option != null && !option.disabled
}

function firstEnabled(from: number, step: 1 | -1): number {
  for (let index = from; index >= 0 && index < shown.value.length; index += step) {
    if (isEnabled(index)) return index
  }
  return -1
}

// ------------------------------------------------------------ positioning ---

const MENU_MAX_HEIGHT = 320
const GAP = 4
const EDGE = 8

function position() {
  const rect = fieldBox.value?.querySelector(':scope > div')?.getBoundingClientRect()
  if (!rect) return

  const below = window.innerHeight - rect.bottom - GAP - EDGE
  const above = rect.top - GAP - EDGE
  const wanted = Math.min(menu.value?.scrollHeight ?? MENU_MAX_HEIGHT, MENU_MAX_HEIGHT)
  placement.value = below >= wanted || below >= above ? 'bottom' : 'top'

  const room = placement.value === 'bottom' ? below : above
  menuStyle.value = {
    left: `${rect.left}px`,
    width: `${rect.width}px`,
    maxHeight: `${Math.max(Math.min(room, MENU_MAX_HEIGHT), 120)}px`,
    ...(placement.value === 'bottom'
      ? { top: `${rect.bottom + GAP}px` }
      : { bottom: `${window.innerHeight - rect.top + GAP}px` }),
  }
}

function scrollActiveIntoView() {
  if (activeIndex.value < 0) return
  document.getElementById(optionId(activeIndex.value))?.scrollIntoView({ block: 'nearest' })
}

// ------------------------------------------------------------ open / close ---

function show() {
  if (props.disabled || open.value) return
  activeIndex.value = isEnabled(selectedIndex.value) ? selectedIndex.value : firstEnabled(0, 1)
  position()
  open.value = true
  void nextTick(() => {
    position()
    scrollActiveIntoView()
  })
}

function hide() {
  open.value = false
  query.value = ''
  editing.value = false
}

function choose(index: number) {
  if (!isEnabled(index)) return
  model.value = shown.value[index]!.value
  hide()
  field.value?.focus()
}

function onPointerDownOutside(event: PointerEvent) {
  const target = event.target as Node
  if (fieldBox.value?.contains(target) || menu.value?.contains(target)) return
  hide()
}

function attach() {
  document.addEventListener('pointerdown', onPointerDownOutside, true)
  window.addEventListener('scroll', position, { capture: true, passive: true })
  window.addEventListener('resize', position, { passive: true })
}

function detach() {
  document.removeEventListener('pointerdown', onPointerDownOutside, true)
  window.removeEventListener('scroll', position, { capture: true })
  window.removeEventListener('resize', position)
}

watch(open, (isOpen) => (isOpen ? attach() : detach()))

watch(
  () => props.disabled,
  (disabled) => disabled && hide(),
)

// Watchers stop before unmount, so drop the listeners here rather than via `open`.
onBeforeUnmount(detach)

// --------------------------------------------------------------- keyboard ---

function move(to: number, step: 1 | -1) {
  const next = firstEnabled(Math.min(Math.max(to, 0), shown.value.length - 1), step)
  if (next >= 0) {
    activeIndex.value = next
    void nextTick(scrollActiveIntoView)
  }
}

function onInput(event: Event) {
  query.value = (event.target as HTMLInputElement).value
  editing.value = true
  show()
  activeIndex.value = firstEnabled(0, 1)
  void nextTick(() => {
    position()
    scrollActiveIntoView()
  })
}

function onKeydown(event: KeyboardEvent) {
  if (!open.value) {
    if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
      event.preventDefault()
      show()
    }
    return
  }

  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault()
      if (event.altKey) choose(activeIndex.value)
      else move(activeIndex.value + 1, 1)
      break
    case 'ArrowUp':
      event.preventDefault()
      if (event.altKey) choose(activeIndex.value)
      else move(activeIndex.value - 1, -1)
      break
    case 'PageDown':
      event.preventDefault()
      move(activeIndex.value + 10, 1)
      break
    case 'PageUp':
      event.preventDefault()
      move(activeIndex.value - 10, -1)
      break
    case 'Enter':
      event.preventDefault()
      choose(activeIndex.value)
      break
    case 'Escape':
      event.preventDefault()
      hide()
      break
    case 'Tab':
      hide()
      break
  }
}

function onFocus() {
  focused.value = true
  field.value?.select()
}

function onBlur() {
  focused.value = false
  hide()
}

/** Opens the menu; the label is selected so typing replaces it rather than extending it. */
function onClick() {
  if (!open.value) show()
  if (!editing.value) field.value?.select()
}
</script>

<template>
  <div>
    <TextField
      ref="textField"
      variant="outlined"
      class="w-full"
      :label="label"
      :model-value="editing ? query : (selected?.label ?? '')"
      :disabled="disabled"
      :supporting-text="supportingText"
      role="combobox"
      autocomplete="off"
      spellcheck="false"
      aria-autocomplete="list"
      aria-haspopup="listbox"
      :aria-expanded="open"
      :aria-controls="listboxId"
      :aria-activedescendant="open && activeIndex >= 0 ? optionId(activeIndex) : undefined"
      @input="onInput"
      @click="onClick"
      @keydown="onKeydown"
      @focus="onFocus"
      @blur="onBlur"
    >
      <template v-if="selected?.swatch && !editing" #icon>
        <span class="grid place-items-center" aria-hidden="true">
          <span class="size-3 rounded-full" :style="{ backgroundColor: selected.swatch }" />
        </span>
      </template>
      <template #trailing-icon>
        <span
          class="pointer-events-none icon transition-transform duration-(--duration-spring-fast-spatial) ease-spring-fast-spatial"
          :class="[open && 'rotate-180', !disabled && (focused || open) && 'text-primary']"
          aria-hidden="true"
          >arrow_drop_down</span
        >
      </template>
    </TextField>

    <Teleport v-if="mounted" :to="menuHost">
      <Transition
        @enter="showMenu"
        enter-active-class="transition-[opacity,scale] duration-350 ease-spatial-fast"
        enter-from-class="scale-y-75 opacity-0"
        leave-active-class="transition-opacity duration-150 ease-effects-fast"
        leave-to-class="opacity-0"
      >
        <div
          v-if="open"
          :id="listboxId"
          ref="menu"
          role="listbox"
          popover="manual"
          :aria-label="label"
          class="fixed inset-auto m-0 overflow-y-auto overscroll-contain rounded-large border-0 bg-surface-container-low p-1 text-on-surface shadow-elevation-2"
          :class="placement === 'top' ? 'origin-bottom' : 'origin-top'"
          :style="menuStyle"
          @mousedown.prevent
        >
          <p v-if="shown.length === 0" class="px-3 py-3 text-body-medium text-on-surface-variant">
            {{ query ? 'No matches.' : 'Nothing to choose from.' }}
          </p>

          <template v-for="(section, sectionIndex) in sections" :key="sectionIndex">
            <div
              v-if="sectionIndex > 0"
              class="mx-3 my-1 h-px bg-outline-variant"
              aria-hidden="true"
            />
            <div
              :role="section.group ? 'group' : 'presentation'"
              :aria-labelledby="section.group ? `${id}-group-${sectionIndex}` : undefined"
            >
              <p
                v-if="section.group"
                :id="`${id}-group-${sectionIndex}`"
                class="px-3 pt-3 pb-1 text-label-medium text-on-surface-variant"
              >
                {{ section.group }}
              </p>

              <div
                v-for="{ option, index } in section.items"
                :id="optionId(index)"
                :key="index"
                role="option"
                :aria-selected="index === selectedIndex"
                :aria-disabled="option.disabled || undefined"
                :data-active="(index === activeIndex && !option.disabled) || undefined"
                class="state-layer flex min-h-12 items-center gap-3 px-3 py-2 text-label-large transition-[border-radius] duration-350 ease-spatial-fast"
                :class="[
                  index === selectedIndex
                    ? 'rounded-medium bg-tertiary-container text-on-tertiary-container'
                    : 'rounded-extra-small',
                  option.disabled
                    ? 'cursor-not-allowed text-on-surface/38'
                    : index === selectedIndex
                      ? 'cursor-pointer'
                      : 'cursor-pointer text-on-surface',
                ]"
                @pointermove="!option.disabled && (activeIndex = index)"
                @click="choose(index)"
              >
                <span
                  v-if="option.swatch"
                  class="size-3 shrink-0 rounded-full"
                  :class="option.disabled && 'opacity-38'"
                  :style="{ backgroundColor: option.swatch }"
                  aria-hidden="true"
                />
                <span class="min-w-0 flex-1 truncate">{{ option.label }}</span>
                <span
                  v-if="option.trailing"
                  class="shrink-0 text-body-medium"
                  :class="index === selectedIndex ? 'opacity-80' : 'text-on-surface-variant'"
                  >{{ option.trailing }}</span
                >
                <span
                  v-if="index === selectedIndex"
                  class="shrink-0 icon [--icon-size:20px] icon-filled"
                  aria-hidden="true"
                  >check</span
                >
              </div>
            </div>
          </template>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>
