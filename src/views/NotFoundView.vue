<script setup lang="ts">
import { RouterLink } from 'vue-router'
</script>

<template>
  <div
    class="flex flex-col items-center gap-3.5 rounded-lg border border-line bg-surface px-8 py-10 text-center"
  >
    <h1 class="text-[34px] font-bold">404</h1>
    <p class="text-muted">That page does not exist.</p>
    <RouterLink class="btn btn-secondary" to="/">Back to overview</RouterLink>
  </div>
</template>
