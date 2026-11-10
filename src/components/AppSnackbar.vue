<script setup lang="ts">
import { computed } from 'vue'
import { Snackbar } from 'tailwind-material3'

import HaloMark from '@/components/HaloMark.vue'
import { useSnackbar } from '@/lib/snackbar'

/**
 * The app's one snackbar (tailwind-material3's Snackbar), drawing whatever `useSnackbar` holds:
 * the reply to an action ("Settings saved.") or a standing state ("Reconnecting…"). It leaves on
 * its own, later if it has an action or is an error, and holds while the pointer or focus is on
 * it; a standing message stays until it is cleared. See "Snackbar" in BRANDING.md.
 */
const { current, dismiss } = useSnackbar()

const SHORT_MS = 4000
const LONG_MS = 8000

const timeout = computed(() => {
  const snack = current.value
  if (!snack || snack.standing) return 0
  return snack.error || snack.action ? LONG_MS : SHORT_MS
})

function onOpen(open: boolean) {
  if (!open) dismiss(current.value?.id)
}

function act() {
  const action = current.value?.action
  if (!action) return
  if ('href' in action) window.open(action.href, '_blank', 'noopener')
  else action.run()
}
</script>

<template>
  <!-- Keyed by message, so a replacement starts its own timer. -->
  <Snackbar
    v-if="current"
    :key="current.id"
    :open="true"
    :timeout="timeout"
    :action-label="current.action?.label"
    :closable="current.error"
    close-label="Close"
    @update:open="onOpen"
    @action="act"
  >
    <span class="flex items-center gap-3">
      <HaloMark v-if="current.busy" :size="24" inverse />
      {{ current.text }}
    </span>
  </Snackbar>
</template>
