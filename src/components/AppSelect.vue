<script setup lang="ts" generic="T extends string | number | null">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'

import OutlinedField from '@/components/OutlinedField.vue'
import type { SelectOption } from '@/lib/select'

/**
 * M3 exposed dropdown menu: an outlined field that opens a menu of options.
 * Keyboard and screen reader behaviour follow the WAI-ARIA select-only combobox
 * pattern, with focus kept on the field while the menu is open.
 */
const props = defineProps<{
  label: string
  options: SelectOption<T>[]
  disabled?: boolean
  supportingText?: string
}>()

const model = defineModel<T>({ required: true })

const id = useId()
const labelId = `${id}-label`
const listboxId = `${id}-listbox`
const supportingId = `${id}-supporting`
const optionId = (index: number) => `${id}-option-${index}`

const field = ref<HTMLButtonElement | null>(null)
const menu = ref<HTMLElement | null>(null)

const open = ref(false)
const focused = ref(false)
const activeIndex = ref(-1)
const placement = ref<'bottom' | 'top'>('bottom')
const menuStyle = ref<Record<string, string>>({})

/** Characters typed in quick succession, for type-ahead. */
let typed = ''
let typedTimer: ReturnType<typeof setTimeout> | undefined

// The menu teleports to <body> so card overflow cannot clip it. Teleport only
// after hydration, since the server render has no menu to match.
const mounted = ref(false)
onMounted(() => (mounted.value = true))

const selectedIndex = computed(() =>
  props.options.findIndex((option) => option.value === model.value),
)
const selected = computed(() => props.options[selectedIndex.value])

/** Runs of options sharing a group become labelled sections, like <optgroup>. */
const sections = computed(() => {
  const result: { group?: string; items: { option: SelectOption<T>; index: number }[] }[] = []
  props.options.forEach((option, index) => {
    const last = result[result.length - 1]
    if (last && last.group === option.group) last.items.push({ option, index })
    else result.push({ group: option.group, items: [{ option, index }] })
  })
  return result
})

const isEnabled = (index: number) => {
  const option = props.options[index]
  return option != null && !option.disabled
}

function firstEnabled(from: number, step: 1 | -1): number {
  for (let index = from; index >= 0 && index < props.options.length; index += step) {
    if (isEnabled(index)) return index
  }
  return -1
}

// ------------------------------------------------------------ positioning ---

const MENU_MAX_HEIGHT = 320
const GAP = 4
const EDGE = 8

function position() {
  const rect = field.value?.getBoundingClientRect()
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
  typed = ''
}

function choose(index: number) {
  if (!isEnabled(index)) return
  model.value = props.options[index]!.value
  hide()
  field.value?.focus()
}

function onPointerDownOutside(event: PointerEvent) {
  const target = event.target as Node
  if (field.value?.contains(target) || menu.value?.contains(target)) return
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
onBeforeUnmount(() => {
  detach()
  clearTimeout(typedTimer)
})

// --------------------------------------------------------------- keyboard ---

function move(to: number, step: 1 | -1) {
  const next = firstEnabled(Math.min(Math.max(to, 0), props.options.length - 1), step)
  if (next >= 0) {
    activeIndex.value = next
    void nextTick(scrollActiveIntoView)
  }
}

// Type-ahead: typing jumps to the next option starting with the typed text,
// ignoring leading symbols such as the # on channel names.
function typeAhead(char: string) {
  clearTimeout(typedTimer)
  typedTimer = setTimeout(() => (typed = ''), 600)
  typed += char.toLowerCase()

  const count = props.options.length
  const start = typed.length === 1 ? activeIndex.value + 1 : Math.max(activeIndex.value, 0)
  for (let offset = 0; offset < count; offset++) {
    const index = (start + offset) % count
    const text = props.options[index]!.label.replace(/^[^\p{L}\p{N}]+/u, '').toLowerCase()
    if (isEnabled(index) && text.startsWith(typed)) {
      activeIndex.value = index
      void nextTick(scrollActiveIntoView)
      return
    }
  }
}

function onKeydown(event: KeyboardEvent) {
  const printable = event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey

  if (!open.value) {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
      event.preventDefault()
      show()
    } else if (printable) {
      show()
      typeAhead(event.key)
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
    case 'Home':
      event.preventDefault()
      move(0, 1)
      break
    case 'End':
      event.preventDefault()
      move(props.options.length - 1, -1)
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
    case ' ':
      event.preventDefault()
      if (typed) typeAhead(' ')
      else choose(activeIndex.value)
      break
    case 'Escape':
      event.preventDefault()
      hide()
      break
    case 'Tab':
      hide()
      break
    default:
      if (printable) typeAhead(event.key)
  }
}
</script>

<template>
  <div>
    <OutlinedField
      :label="label"
      :label-id="labelId"
      :populated="selected != null"
      :focused="focused || open"
      :disabled="disabled"
      :supporting-text="supportingText"
      :supporting-id="supportingId"
    >
      <button
        ref="field"
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        :aria-expanded="open"
        :aria-controls="listboxId"
        :aria-labelledby="labelId"
        :aria-describedby="supportingText ? supportingId : undefined"
        :aria-activedescendant="open && activeIndex >= 0 ? optionId(activeIndex) : undefined"
        :disabled="disabled"
        class="flex h-14 w-full cursor-pointer items-center rounded-xs bg-transparent pr-12 pl-4 text-left text-body-large text-on-surface focus-visible:outline-none disabled:cursor-not-allowed disabled:text-on-surface/38"
        @click="open ? hide() : show()"
        @keydown="onKeydown"
        @focus="focused = true"
        @blur="focused = false"
      >
        <span class="flex min-w-0 items-center gap-2">
          <span
            v-if="selected?.swatch"
            class="size-3 shrink-0 rounded-full"
            :style="{ backgroundColor: selected.swatch }"
            aria-hidden="true"
          />
          <span class="truncate">{{ selected?.label }}</span>
        </span>
      </button>

      <span
        class="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 icon transition-transform duration-350 ease-spatial-fast"
        :class="[
          open && 'rotate-180',
          disabled
            ? 'text-on-surface/38'
            : focused || open
              ? 'text-primary'
              : 'text-on-surface-variant',
        ]"
        aria-hidden="true"
        >arrow_drop_down</span
      >
    </OutlinedField>

    <Teleport v-if="mounted" to="body">
      <Transition
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
          :aria-labelledby="labelId"
          class="fixed z-50 overflow-y-auto overscroll-contain rounded-lg bg-surface-container-high p-1 shadow-level2"
          :class="placement === 'top' ? 'origin-bottom' : 'origin-top'"
          :style="menuStyle"
          @mousedown.prevent
        >
          <p v-if="options.length === 0" class="px-3 py-3 text-body-medium text-on-surface-variant">
            Nothing to choose from.
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
                    ? 'rounded-md bg-tertiary-container text-on-tertiary-container'
                    : 'rounded-xs',
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
