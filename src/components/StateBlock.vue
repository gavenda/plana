<script setup lang="ts">
defineProps<{
  loading?: boolean
  error?: string | null
  empty?: boolean
  emptyText?: string
}>()
</script>

<template>
  <!-- Renders the slot only once there is something real to show. -->
  <div v-if="loading" class="flex items-center justify-center gap-2.5 px-5 py-9 text-sm text-muted">
    <svg class="animate-spin" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <circle
        cx="12"
        cy="12"
        r="9"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
        stroke-dasharray="44"
        stroke-dashoffset="14"
        stroke-linecap="round"
      />
    </svg>
    <span>Loading…</span>
  </div>

  <div v-else-if="error" class="alert alert-error">{{ error }}</div>

  <div v-else-if="empty" class="flex items-center justify-center px-5 py-9 text-sm text-muted">
    {{ emptyText ?? 'Nothing here yet.' }}
  </div>

  <slot v-else />
</template>
