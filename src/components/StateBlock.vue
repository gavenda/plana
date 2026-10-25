<script setup lang="ts">
import HaloMark from '@/components/HaloMark.vue'
import PlanaSays from '@/components/PlanaSays.vue'
import type { PlanaMood } from '@/lib/plana'

/**
 * Loading, error and empty states around a block of content. Plana shows up for an empty
 * state given an `emptyMood`, and for a load failure unless `compact` (a small card beside
 * figures, where she never goes). See "Where she appears" in BRANDING.md.
 */
defineProps<{
  loading?: boolean
  error?: string | null
  empty?: boolean
  /** Her line for the empty state, or plain text when there is no `emptyMood`. */
  emptyText?: string
  emptyMood?: PlanaMood
  compact?: boolean
  /** Offered as "Try again" when loading failed. */
  retry?: () => unknown
}>()
</script>

<template>
  <!-- Renders the slot only once there is something real to show. -->
  <div
    v-if="loading"
    class="flex items-center justify-center gap-3 px-6 py-10 text-body-medium text-on-surface-variant"
  >
    <HaloMark />
    <span>Processing…</span>
  </div>

  <div v-else-if="error && compact" class="card card-error mx-6 my-4 px-4 py-3">{{ error }}</div>

  <div v-else-if="error" class="flex flex-col items-center gap-4 px-6 py-10">
    <PlanaSays mood="confused">I'm confused... This didn't load.</PlanaSays>
    <p class="card card-error px-4 py-3">{{ error }}</p>
    <button v-if="retry" class="btn btn-tonal" type="button" @click="retry()">Try again</button>
  </div>

  <div v-else-if="empty && emptyMood" class="flex flex-col items-center gap-3 px-6 py-10">
    <PlanaSays :mood="emptyMood">{{ emptyText }}</PlanaSays>
    <p v-if="$slots.empty" class="text-body-medium text-on-surface-variant">
      <slot name="empty" />
    </p>
  </div>

  <div
    v-else-if="empty"
    class="flex items-center justify-center px-6 py-10 text-body-medium text-on-surface-variant"
  >
    {{ emptyText ?? 'Nothing here yet.' }}
  </div>

  <slot v-else />
</template>
