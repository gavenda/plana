<script setup lang="ts">
import { onBeforeUnmount, watch } from 'vue'

import { useSnackbar, type SnackbarAction } from '@/lib/snackbar'

/**
 * M3 snackbar: the reply to an action ("Settings saved.", "Discord rejected the role change."),
 * at the foot of the page. It leaves on its own, later if it has an action or is an error, and
 * holds while the pointer or focus is on it. See "Snackbar" in BRANDING.md.
 */
const { current, dismiss } = useSnackbar()

const SHORT_MS = 4000
const LONG_MS = 8000

let timer: ReturnType<typeof setTimeout> | undefined
let held = false

function stop() {
  clearTimeout(timer)
  timer = undefined
}

function start() {
  stop()
  const snack = current.value
  if (!snack || held) return
  const id = snack.id
  timer = setTimeout(() => dismiss(id), snack.error || snack.action ? LONG_MS : SHORT_MS)
}

// A replaced snackbar may leave while held, without a pointerleave or focusout to release it.
watch(
  () => current.value?.id,
  () => {
    held = false
    start()
  },
)
onBeforeUnmount(stop)

function hold() {
  held = true
  stop()
}

function release() {
  held = false
  start()
}

function act(action: SnackbarAction) {
  if ('run' in action) action.run()
  dismiss()
}
</script>

<template>
  <!-- Centred under the page, beside the rail. The live region is always there, so each new
       message is read out; an error interrupts. -->
  <div class="snackbar-host" :aria-live="current?.error ? 'assertive' : 'polite'">
    <Transition
      mode="out-in"
      enter-active-class="transition-[opacity,translate] duration-350 ease-spatial-fast"
      enter-from-class="translate-y-4 opacity-0"
      leave-active-class="transition-opacity duration-200 ease-effects"
      leave-to-class="opacity-0"
    >
      <div
        v-if="current"
        :key="current.id"
        class="pointer-events-auto flex min-h-12 w-full max-w-[672px] min-w-[min(344px,100%)] items-center gap-1 rounded-xs bg-inverse-surface py-1 pr-2 pl-4 text-inverse-on-surface shadow-level3 expanded:w-auto"
        @pointerenter="hold"
        @pointerleave="release"
        @focusin="hold"
        @focusout="release"
      >
        <p class="flex-1 py-2.5 text-body-medium">{{ current.text }}</p>
        <template v-if="current.action">
          <a
            v-if="'href' in current.action"
            class="btn btn-text text-inverse-primary"
            :href="current.action.href"
            target="_blank"
            rel="noopener"
            @click="dismiss()"
            >{{ current.action.label }}</a
          >
          <button
            v-else
            class="btn btn-text text-inverse-primary"
            type="button"
            @click="act(current.action)"
          >
            {{ current.action.label }}
          </button>
        </template>
        <button
          v-if="current.error"
          class="icon-btn text-inverse-on-surface"
          type="button"
          aria-label="Close"
          title="Close"
          @click="dismiss()"
        >
          <span class="icon" aria-hidden="true">close</span>
        </button>
      </div>
    </Transition>
  </div>
</template>
