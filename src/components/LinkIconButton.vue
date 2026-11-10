<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router'

/**
 * A link drawn as a tailwind-material3 standard icon button (40dp, or 32dp wide when narrow).
 * The library's IconButton only renders a <button>; this keeps a link a link. `to` is a route,
 * `href` an outside page, opened in a new tab.
 */
defineProps<{ label: string; to?: RouteLocationRaw; href?: string; narrow?: boolean }>()
</script>

<template>
  <component
    :is="to ? 'RouterLink' : 'a'"
    :to="to"
    :href="to ? undefined : href"
    :target="to ? undefined : '_blank'"
    :rel="to ? undefined : 'noopener noreferrer'"
    :aria-label="label"
    class="relative inline-grid h-10 shrink-0 place-items-center rounded-full text-on-surface-variant before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit] before:bg-current before:opacity-0 before:transition-opacity hover:before:opacity-8 focus:outline-none focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-secondary focus-visible:outline-solid focus-visible:before:opacity-10 active:before:opacity-10"
    :class="narrow ? 'w-8' : 'w-10'"
  >
    <slot />
  </component>
</template>
