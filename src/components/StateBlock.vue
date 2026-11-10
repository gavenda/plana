<script setup lang="ts">
import { Button } from 'tailwind-material3'
import HaloMark from '@/components/HaloMark.vue'
import PlanaSays from '@/components/PlanaSays.vue'
import type { PlanaMood } from '@/lib/plana'

/**
 * Loading, error and empty states around a block of content. While loading, a `#skeleton`
 * slot (the content's shape, such as `SkeletonList`) stands in for her halo. Plana shows up
 * for an empty state given an `emptyMood`, and for a load failure unless `compact` (a small
 * card beside figures, where she never goes). See "Where she appears" in BRANDING.md.
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
  <div v-if="loading && $slots.skeleton" role="status" aria-busy="true">
    <span class="sr-only">Processing…</span>
    <slot name="skeleton" />
  </div>

  <div
    v-else-if="loading"
    class="flex items-center justify-center gap-3 px-6 py-10 text-body-medium text-on-surface-variant"
  >
    <HaloMark />
    <span>Processing…</span>
  </div>

  <div
    v-else-if="error && compact"
    class="mx-6 my-4 overflow-hidden rounded-medium bg-error-container px-4 py-3 text-on-error-container"
  >
    {{ error }}
  </div>

  <div v-else-if="error" class="flex flex-col items-center gap-4 px-6 py-10">
    <PlanaSays mood="confused">I'm confused... This didn't load.</PlanaSays>
    <p class="overflow-hidden rounded-medium bg-error-container px-4 py-3 text-on-error-container">
      {{ error }}
    </p>
    <Button variant="tonal" v-if="retry" @click="retry()">Try again</Button>
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
