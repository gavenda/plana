<script setup lang="ts">
import { computed } from 'vue'

/** A thin bar under a ranked row, as long as its value is against the list's first. */
const props = defineProps<{ value: number; max: number }>()

const width = computed(() =>
  props.max > 0 ? `${Math.max(2, Math.round((props.value / props.max) * 100))}%` : '0%',
)
</script>

<template>
  <span class="mt-1.5 block h-1 rounded-full bg-primary/60" :style="{ width }" aria-hidden="true" />
</template>
