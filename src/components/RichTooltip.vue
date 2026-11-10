<script setup lang="ts">
import { IconButton, Tooltip } from 'tailwind-material3'

/**
 * An icon button with a tooltip (tailwind-material3's Tooltip and IconButton).
 *
 * By default it is an info button with a rich tooltip: a subhead and a line or two of supporting
 * text, for context that is useful but not needed to fill the field in. Hovering or focusing
 * opens it; a click keeps it open until dismissed, which is also how touch reaches it.
 *
 * With `action`, the button is an action's instead: a click emits `click`, and the tooltip names
 * the action (a rich one when there is `text`). With `href`, it is a link that opens in a new tab.
 * The default slot adds to the button, such as a badge.
 */
const props = defineProps<{
  /** The subhead, usually the field's own label. */
  title: string
  /** The supporting line; leave out for a tooltip that is just the subhead. */
  text?: string
  /** Makes the trigger a link that opens in a new tab, with its label, instead of an info button. */
  href?: string
  /** The trigger's icon; an info icon by default. */
  icon?: string
  /** The trigger's accessible name; "About" plus the title by default, or the title for an action. */
  label?: string
  narrow?: boolean
  /** A tonal trigger, for an action that should stand out a little. */
  tonal?: boolean
  /** Makes the trigger an action's button: a click emits `click` rather than pinning the tooltip. */
  action?: boolean
  disabled?: boolean
  /** For a toggle action: whether it is on. */
  pressed?: boolean
}>()

defineEmits<{ click: [] }>()

const name = () =>
  props.label ?? (props.action || props.href ? props.title : `About ${props.title}`)
</script>

<template>
  <Tooltip v-if="href" :text="title">
    <a
      :href="href"
      target="_blank"
      rel="noopener noreferrer"
      :aria-label="name()"
      class="relative inline-grid h-10 shrink-0 place-items-center rounded-full text-on-surface-variant before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit] before:bg-current before:opacity-0 before:transition-opacity hover:before:opacity-8 focus:outline-none focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-secondary focus-visible:outline-solid focus-visible:before:opacity-10"
      :class="narrow ? 'w-8' : 'w-10'"
    >
      <span class="icon [--icon-size:20px]" aria-hidden="true">{{ icon ?? 'open_in_new' }}</span>
      <slot />
    </a>
  </Tooltip>

  <Tooltip
    v-else
    :variant="text || !action ? 'rich' : 'plain'"
    :text="text ?? (action ? title : undefined)"
    :persistent="!action"
    :disabled="disabled"
  >
    <template v-if="text || !action" #subhead>{{ title }}</template>
    <IconButton
      :label="name()"
      :variant="tonal ? 'tonal' : 'standard'"
      :width="narrow ? 'narrow' : 'default'"
      :disabled="disabled"
      :aria-pressed="action ? pressed : undefined"
      @click="action && $emit('click')"
    >
      <!-- The library sizes the slot's one child to the icon's box, so the badge goes inside it. -->
      <span class="relative grid place-items-center">
        <span class="icon [--icon-size:20px]" aria-hidden="true">{{ icon ?? 'info' }}</span>
        <slot />
      </span>
    </IconButton>
  </Tooltip>
</template>
