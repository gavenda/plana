<script setup lang="ts">
import { computed } from 'vue'
import { useLink } from 'vue-router'

/**
 * One rail entry. The slim and open rail are the same element, morphed by `.rail-item` in
 * main.css, so nothing pops.
 */
const props = withDefaults(
  defineProps<{
    /** A Material Symbols name; add new ones to the icon_names list in index.html. */
    icon: string
    label: string
    expanded: boolean
    /** Makes it a link; without one it is a button and the parent handles `click`. */
    to?: string
    /** Overview is only current at `/` itself; the rest are also current on pages beneath them. */
    exact?: boolean
  }>(),
  { to: undefined, exact: false },
)

const emit = defineEmits<{ click: [] }>()

const link = useLink({ to: computed(() => props.to ?? '/') })
const isActive = computed(
  () => props.to !== undefined && (props.exact ? link.isExactActive.value : link.isActive.value),
)

function onClick(event: MouseEvent) {
  if (props.to !== undefined) void link.navigate(event)
  emit('click')
}
</script>

<template>
  <component
    :is="to !== undefined ? 'a' : 'button'"
    class="rail-item"
    :href="to !== undefined ? link.href.value : undefined"
    :type="to !== undefined ? undefined : 'button'"
    :data-expanded="expanded"
    :data-active="isActive"
    :aria-current="isActive ? 'page' : undefined"
    @click="onClick"
  >
    <!-- What gives the item its open width; never seen, never read out. -->
    <span class="rail-item-ghost" aria-hidden="true">{{ label }}</span>
    <span class="rail-item-pill" />
    <span class="rail-item-icon icon" :class="isActive && 'icon-filled'" aria-hidden="true">{{
      icon
    }}</span>
    <span class="rail-item-label">{{ label }}</span>
  </component>
</template>
