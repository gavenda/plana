<script setup lang="ts">
import { RouterLink } from 'vue-router'

import PlanaSays from '@/components/PlanaSays.vue'
import SchaleMark from '@/components/SchaleMark.vue'
</script>

<template>
  <div class="relative isolate grid w-full place-items-center">
    <SchaleMark
      class="pointer-events-none absolute top-1/2 left-1/2 -z-10 w-[720px] max-w-none -translate-1/2 text-on-surface/4"
    />
    <div
      class="flex w-full max-w-[400px] flex-col items-center gap-4 rounded-3xl bg-surface-container-low px-10 py-12 text-center shadow-level1"
    >
      <PlanaSays mood="puzzled" :size="128" layout="column">
        This place is... I see. There's nothing here.
      </PlanaSays>
      <h1 class="text-display-large font-semibold text-primary">404</h1>
      <p class="text-body-large text-on-surface-variant">That page does not exist.</p>
      <RouterLink class="btn btn-tonal mt-2" to="/">Back to overview</RouterLink>
    </div>
  </div>
</template>
