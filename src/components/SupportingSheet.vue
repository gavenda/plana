<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, useId, watch } from 'vue'

/**
 * M3 supporting pane, as a sheet that never moves the page's own layout. What it becomes
 * depends on the window class:
 * - large and up: a standard side sheet docked at the right. The page makes room for it
 *   (`.shell:has(.supporting-sheet)` in main.css), and it is not modal.
 * - expanded: the same side sheet, modal over the page, since making room would crush it.
 * - below: a modal bottom sheet with a drag handle.
 * Escape and the close button shut it in every form, and so does the scrim where there is one.
 */
defineProps<{
  headline?: string
  /** The sheet's name for assistive tech when it has no visible headline. */
  label?: string
}>()
const open = defineModel<boolean>('open', { required: true })

const headlineId = useId()
const sheet = ref<HTMLElement | null>(null)

/** Where focus was before the sheet took it, to hand it back on close. */
let returnFocus: HTMLElement | null = null

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && open.value) {
    event.stopPropagation()
    open.value = false
  }
}

watch(open, async (value) => {
  if (value) {
    returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    await nextTick()
    sheet.value?.focus({ preventScroll: true })
  } else {
    returnFocus?.focus({ preventScroll: true })
    returnFocus = null
  }
})

onBeforeUnmount(() => (returnFocus = null))
</script>

<template>
  <!-- Scrim, for the modal forms only. -->
  <Transition
    enter-active-class="transition-opacity duration-300 ease-standard-decelerate"
    enter-from-class="opacity-0"
    leave-active-class="transition-opacity duration-200 ease-standard-accelerate"
    leave-to-class="opacity-0"
  >
    <div
      v-if="open"
      class="fixed inset-0 z-40 bg-scrim/32 large:hidden"
      aria-hidden="true"
      @click="open = false"
    />
  </Transition>

  <Transition
    enter-active-class="transition-[translate,opacity] duration-400 ease-emphasized-decelerate"
    enter-from-class="max-expanded:translate-y-full expanded:translate-x-[calc(100%+16px)] opacity-0"
    leave-active-class="transition-[translate,opacity] duration-200 ease-standard-accelerate"
    leave-to-class="max-expanded:translate-y-full expanded:translate-x-[calc(100%+16px)] opacity-0"
  >
    <aside
      v-if="open"
      ref="sheet"
      tabindex="-1"
      :aria-labelledby="headline ? headlineId : undefined"
      :aria-label="headline ? undefined : label"
      class="supporting-sheet fixed z-50 flex flex-col bg-surface-container-low text-on-surface shadow-level1 outline-none max-expanded:inset-x-0 max-expanded:bottom-0 max-expanded:mx-auto max-expanded:max-h-[85dvh] max-expanded:max-w-[640px] max-expanded:rounded-t-xl expanded:top-4 expanded:right-4 expanded:bottom-4 expanded:w-sheet expanded:rounded-xl"
      @keydown="onKeydown"
    >
      <!-- Bottom sheets carry a drag handle; it closes the sheet when pressed. -->
      <button
        type="button"
        class="mx-auto mt-4 grid h-6 w-12 shrink-0 cursor-pointer place-items-center expanded:hidden"
        aria-label="Close"
        @click="open = false"
      >
        <span class="h-1 w-8 rounded-full bg-on-surface-variant/40" />
      </button>

      <header class="flex shrink-0 items-center gap-4 py-4 pr-3 pl-6">
        <slot name="leading" />
        <div class="min-w-0 flex-1">
          <h2 v-if="headline" :id="headlineId" class="truncate text-title-large" :title="headline">
            {{ headline }}
          </h2>
          <p v-if="$slots.supporting" class="text-body-medium text-on-surface-variant">
            <slot name="supporting" />
          </p>
        </div>
        <button
          type="button"
          class="icon-btn self-start text-on-surface-variant"
          aria-label="Close"
          @click="open = false"
        >
          <span class="icon" aria-hidden="true">close</span>
        </button>
      </header>

      <div class="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        <slot />
      </div>
    </aside>
  </Transition>
</template>
