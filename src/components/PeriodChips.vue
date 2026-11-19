<script setup lang="ts">
import { Chip } from 'tailwind-material3'

import { PERIODS } from '@/lib/period'

/** The stats period as filter chips; `null` is all time. */
const days = defineModel<number | null>({ required: true })
</script>

<template>
  <div class="flex flex-1 flex-wrap gap-2" role="group" aria-label="Period">
    <Chip
      v-for="period in PERIODS"
      :key="period.label"
      type="filter"
      :selected="days === period.days"
      @update:selected="days = period.days"
      >{{ period.label }}</Chip
    >
  </div>
</template>
