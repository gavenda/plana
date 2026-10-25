<script setup lang="ts">
/**
 * A segmented list in the shape of the rows about to load, for `StateBlock`'s `#skeleton`
 * slot. Match the real rows: their leading image, rank, line count and trailing text.
 */
withDefaults(
  defineProps<{
    rows?: number
    /** A member's round avatar, or a game's or track's square art. */
    leading?: 'avatar' | 'art'
    /** A "#1" rank column before the leading image. */
    rank?: boolean
    /** A second, smaller line under the name. */
    twoLine?: boolean
    /** What sits at the row's end: one figure, a figure over a label, or buttons. */
    trailing?: 'text' | 'stack' | 'actions'
    /** Classes for each item, as the real list's items have them. */
    itemClass?: string
  }>(),
  { rows: 3, leading: 'avatar' },
)

/** Widths cycled through the rows, so the names don't line up into a grid. */
const WIDTHS = ['60%', '42%', '72%', '50%', '65%', '38%']
</script>

<template>
  <ul class="segmented-list" aria-hidden="true">
    <li v-for="row in rows" :key="row" class="segmented-item" :class="itemClass">
      <span v-if="rank" class="skeleton mx-1.5 h-3 w-4 shrink-0" />
      <span
        class="skeleton size-10 shrink-0"
        :class="leading === 'art' ? 'rounded-sm' : 'rounded-full'"
      />
      <div class="flex min-w-0 flex-1 flex-col gap-2 py-1">
        <span class="skeleton h-3.5" :style="{ width: WIDTHS[(row - 1) % WIDTHS.length] }" />
        <span
          v-if="twoLine"
          class="skeleton h-2.5"
          :style="{ width: WIDTHS[(row + 2) % WIDTHS.length] }"
        />
      </div>
      <span v-if="trailing === 'text'" class="skeleton h-3.5 w-12 shrink-0" />
      <div v-else-if="trailing === 'stack'" class="flex shrink-0 flex-col items-end gap-2">
        <span class="skeleton h-3.5 w-16" />
        <span class="skeleton h-2.5 w-10" />
      </div>
      <div v-else-if="trailing === 'actions'" class="flex shrink-0 gap-2">
        <span class="skeleton h-8 w-20" />
        <span class="skeleton h-8 w-20" />
      </div>
    </li>
  </ul>
</template>
