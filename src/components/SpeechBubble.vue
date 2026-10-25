<script setup lang="ts">
/** `start` points the tail at a portrait beside it, `top` at one above it. */
withDefaults(defineProps<{ tail?: 'start' | 'top' }>(), { tail: 'start' })
</script>

<template>
  <p
    class="relative rounded-lg bg-surface-container-highest px-4 py-3 text-body-large text-on-surface before:absolute before:size-3 before:rotate-45 before:bg-surface-container-highest before:content-['']"
    :class="
      tail === 'start'
        ? 'before:top-1/2 before:-left-1.5 before:-translate-y-1/2'
        : 'before:-top-1.5 before:left-1/2 before:-translate-x-1/2'
    "
  >
    <slot />
  </p>
</template>
