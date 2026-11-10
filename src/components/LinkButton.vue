<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router'

/**
 * A link drawn as a tailwind-material3 button (text or tonal, small). The library's Button only
 * renders a <button>, so a link that should look like one, such as a section's "View all", uses
 * this to keep its link behaviour (middle-click, open in new tab). `to` is a route; `href` an
 * outside page, opened in a new tab.
 */
withDefaults(
  defineProps<{
    to?: RouteLocationRaw
    href?: string
    /** `inherit` is a text button in the surrounding text colour, for a tone container. */
    variant?: 'text' | 'tonal' | 'inherit'
  }>(),
  {
    to: undefined,
    href: undefined,
    variant: 'text',
  },
)
</script>

<template>
  <component
    :is="to ? 'RouterLink' : 'a'"
    :to="to"
    :href="to ? undefined : href"
    :target="to ? undefined : '_blank'"
    :rel="to ? undefined : 'noopener noreferrer'"
    class="relative inline-flex h-10 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-full font-plain text-label-large whitespace-nowrap select-none before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit] before:bg-current before:opacity-0 before:transition-opacity hover:before:opacity-8 focus:outline-none focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-secondary focus-visible:outline-solid focus-visible:before:opacity-10 active:before:opacity-10"
    :class="
      variant === 'tonal'
        ? 'bg-secondary-container px-4 text-on-secondary-container hover:shadow-elevation-1'
        : variant === 'text'
          ? 'px-3 text-primary'
          : 'px-3'
    "
  >
    <slot />
  </component>
</template>
