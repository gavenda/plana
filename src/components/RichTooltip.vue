<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, useId } from 'vue'

/**
 * M3 rich tooltip on an info icon button: a subhead and a line or two of supporting text on
 * surface-container, for context that is useful but not needed to fill the field in.
 *
 * Hovering opens it after M3's 500ms delay and leaving closes it shortly after, so the pointer
 * can cross onto the tooltip; keyboard focus opens it at once. A click (or tap) keeps it open
 * until a click elsewhere or Escape, which is also how touch reaches it.
 *
 * With `action`, the trigger is an action's icon button instead: a click emits `click` and
 * closes the tooltip, which then only names the action. The default slot adds to the trigger,
 * such as a badge.
 */
const props = defineProps<{
  /** The subhead, usually the field's own label. */
  title: string
  /** The supporting line; leave out for a tooltip that is just the subhead. */
  text?: string
  /** Makes the trigger a link that opens in a new tab, with its label, instead of an info button. */
  href?: string
  /** The trigger's icon; an info icon by default. */
  icon?: string
  /** The trigger's accessible name; "About" plus the title by default, or the title for an action. */
  label?: string
  narrow?: boolean
  /** A tonal trigger, for an action that should stand out a little. */
  tonal?: boolean
  /** Makes the trigger an action's button: a click emits `click` rather than pinning the tooltip. */
  action?: boolean
  disabled?: boolean
  /** For a toggle action: whether it is on. */
  pressed?: boolean
}>()

const emit = defineEmits<{ click: [] }>()

const HOVER_DELAY_MS = 500
const LEAVE_DELAY_MS = 200
const GAP_PX = 4
const EDGE_PX = 8

const id = useId()
const trigger = ref<HTMLElement | null>(null)
const tooltip = ref<HTMLElement | null>(null)

// Teleport only after hydration: the server render leaves nothing in <body> for it to match.
const mounted = ref(false)
onMounted(() => (mounted.value = true))

const open = ref(false)
/** Opened by a click: stays until dismissed rather than following the pointer. */
const pinned = ref(false)
const position = ref<{ top: string; left: string }>({ top: '0px', left: '0px' })

let showTimer: ReturnType<typeof setTimeout> | undefined
let hideTimer: ReturnType<typeof setTimeout> | undefined

function clearTimers() {
  clearTimeout(showTimer)
  clearTimeout(hideTimer)
}

/** Below the button, its start aligned to the button's, flipped above or nudged in to fit. */
function place() {
  const anchor = trigger.value?.getBoundingClientRect()
  const box = tooltip.value?.getBoundingClientRect()
  if (!anchor || !box) return

  let top = anchor.bottom + GAP_PX
  if (top + box.height > window.innerHeight - EDGE_PX) top = anchor.top - GAP_PX - box.height

  const left = Math.min(
    Math.max(EDGE_PX, anchor.right - box.width),
    window.innerWidth - EDGE_PX - box.width,
  )
  position.value = { top: `${Math.max(EDGE_PX, top)}px`, left: `${left}px` }
}

async function show() {
  clearTimers()
  if (open.value) return
  open.value = true
  await nextTick()
  place()
  window.addEventListener('scroll', hide, { passive: true, capture: true })
  window.addEventListener('resize', hide, { passive: true })
  document.addEventListener('pointerdown', onOutside, true)
}

function hide() {
  clearTimers()
  open.value = false
  pinned.value = false
  window.removeEventListener('scroll', hide, { capture: true })
  window.removeEventListener('resize', hide)
  document.removeEventListener('pointerdown', onOutside, true)
}

function onOutside(event: PointerEvent) {
  const target = event.target as Node
  if (trigger.value?.contains(target) || tooltip.value?.contains(target)) return
  hide()
}

function onPointerEnter(event: PointerEvent) {
  if (event.pointerType !== 'mouse') return
  clearTimeout(hideTimer)
  if (!open.value) showTimer = setTimeout(show, HOVER_DELAY_MS)
}

function onPointerLeave(event: PointerEvent) {
  if (event.pointerType !== 'mouse') return
  clearTimeout(showTimer)
  if (open.value && !pinned.value) hideTimer = setTimeout(hide, LEAVE_DELAY_MS)
}

function onClick() {
  // A link just goes and an action just runs; the tooltip has already said what they do.
  if (props.action) {
    hide()
    return emit('click')
  }
  if (props.href) return hide()
  if (pinned.value) return hide()
  pinned.value = true
  void show()
}

function onFocus() {
  // Only keyboard focus: a click focuses too, and handles itself.
  if (trigger.value?.matches(':focus-visible')) void show()
}

function onBlur() {
  if (!pinned.value) hide()
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && open.value) {
    event.stopPropagation()
    hide()
  }
}

onBeforeUnmount(hide)
</script>

<template>
  <component
    :is="href ? 'a' : 'button'"
    ref="trigger"
    :type="href ? undefined : 'button'"
    :href="href"
    :target="href ? '_blank' : undefined"
    :rel="href ? 'noopener noreferrer' : undefined"
    class="icon-btn relative"
    :class="[tonal ? 'icon-btn-tonal' : 'text-on-surface-variant', narrow && 'icon-btn-narrow']"
    :disabled="href ? undefined : disabled"
    :aria-label="label ?? (action ? title : `About ${title}`)"
    :aria-describedby="open ? id : undefined"
    :aria-expanded="href || action ? undefined : pinned"
    :aria-pressed="action ? pressed : undefined"
    @pointerenter="onPointerEnter"
    @pointerleave="onPointerLeave"
    @click="onClick"
    @focus="onFocus"
    @blur="onBlur"
    @keydown="onKeydown"
  >
    <span class="icon [--icon-size:20px]" aria-hidden="true">{{ icon ?? 'info' }}</span>
    <slot />
  </component>

  <Teleport v-if="mounted" to="body">
    <Transition
      enter-active-class="transition-[opacity,scale] duration-150 ease-standard-decelerate"
      enter-from-class="opacity-0 scale-90"
      leave-active-class="transition-opacity duration-100 ease-standard-accelerate"
      leave-to-class="opacity-0"
    >
      <div
        v-if="open"
        :id="id"
        ref="tooltip"
        role="tooltip"
        class="fixed z-60 flex max-w-[312px] origin-top-right flex-col gap-1 rounded-md bg-surface-container px-4 pt-3 pb-2 shadow-level2"
        :style="position"
        @pointerenter="onPointerEnter"
        @pointerleave="onPointerLeave"
      >
        <span class="text-title-small text-on-surface-variant">{{ title }}</span>
        <span v-if="text" class="pb-1 text-body-medium text-on-surface-variant">{{ text }}</span>
      </div>
    </Transition>
  </Teleport>
</template>
