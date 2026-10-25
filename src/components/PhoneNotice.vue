<script setup lang="ts">
import PlanaPortrait from '@/components/PlanaPortrait.vue'
</script>

<template>
  <!-- Shown by CSS alone (the `phone:` variant), so it is right on the first server-rendered paint. -->
  <div
    role="alert"
    class="hidden min-h-full flex-col items-center justify-center gap-6 bg-surface px-8 py-12 text-center phone:flex"
  >
    <PlanaPortrait mood="uneasy" :size="128" />

    <div class="flex max-w-[360px] flex-col gap-2">
      <h1 class="text-headline-small">Phones aren't supported</h1>
      <p class="text-body-large text-on-surface-variant">
        The Plana dashboard is built for larger screens. Open it on a tablet or computer, or make
        this window wider.
      </p>
    </div>
  </div>
</template>
