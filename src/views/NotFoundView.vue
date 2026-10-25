<script setup lang="ts">
import { RouterLink } from 'vue-router'

import PlanaSays from '@/components/PlanaSays.vue'
</script>

<template>
  <div class="flex w-full justify-center">
    <div
      class="flex w-full max-w-[400px] flex-col items-center gap-4 rounded-3xl bg-surface-container-low px-10 py-12 text-center shadow-level1"
    >
      <PlanaSays mood="puzzled" layout="column">
        This place is... I see. There's nothing here.
      </PlanaSays>
      <h1 class="text-display-large font-semibold text-primary">404</h1>
      <p class="text-body-large text-on-surface-variant">That page does not exist.</p>
      <RouterLink class="btn btn-tonal mt-2" to="/">Back to overview</RouterLink>
    </div>
  </div>
</template>
