<script setup lang="ts">
import { List, ListItem } from 'tailwind-material3'

/**
 * A segmented list (tailwind-material3's List and ListItem) in the shape of the rows about to load, for `StateBlock`'s `#skeleton`
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
  <List segmented aria-hidden="true">
    <ListItem v-for="row in rows" :key="row" :class="itemClass" class="bg-surface-container!">
      <template #leading>
        <span class="flex items-center gap-4">
          <span v-if="rank" class="skeleton mx-1.5 h-3 w-4 shrink-0" />
          <span
            class="skeleton size-10 shrink-0"
            :class="leading === 'art' ? 'rounded-small' : 'rounded-full'"
          />
        </span>
      </template>
      <span class="flex flex-col gap-2 py-1">
        <span class="skeleton h-3.5" :style="{ width: WIDTHS[(row - 1) % WIDTHS.length] }" />
        <span
          v-if="twoLine"
          class="skeleton h-2.5"
          :style="{ width: WIDTHS[(row + 2) % WIDTHS.length] }"
        />
      </span>
      <template v-if="trailing" #trailing>
        <span v-if="trailing === 'text'" class="skeleton h-3.5 w-12" />
        <span v-else-if="trailing === 'stack'" class="flex flex-col items-end gap-2">
          <span class="skeleton h-3.5 w-16" />
          <span class="skeleton h-2.5 w-10" />
        </span>
        <span v-else class="flex gap-2">
          <span class="skeleton h-8 w-20" />
          <span class="skeleton h-8 w-20" />
        </span>
      </template>
    </ListItem>
  </List>
</template>
