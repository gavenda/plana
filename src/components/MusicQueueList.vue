<script setup lang="ts">
import { IconButton, List, ListItem } from 'tailwind-material3'

import DiscordMention from '@/components/DiscordMention.vue'
import { formatDuration, type MusicTrack } from '@/lib/music'

/**
 * Upcoming tracks as a segmented list, numbered from 1. With `removable`, each has a remove
 * button; `index` in `remove` counts from 0 in the full queue, as Vivy expects.
 */
defineProps<{
  tracks: MusicTrack[]
  removable?: boolean
  disabled?: boolean
}>()

const emit = defineEmits<{ remove: [track: MusicTrack, index: number] }>()
</script>

<template>
  <List segmented>
    <ListItem
      v-for="(track, index) in tracks"
      :key="`${index}:${track.identifier}`"
      class="bg-surface-container!"
    >
      <template #leading>
        <span class="w-6 shrink-0 text-center text-label-large text-on-surface-variant">{{
          index + 1
        }}</span>
      </template>
      <span class="block truncate">{{ track.title }}</span>
      <template #supporting-text>
        <span class="block truncate text-body-small"
          >{{ track.author
          }}<template v-if="track.requester">
            ·
            <DiscordMention
              kind="user"
              :name="track.requester.name"
              :id="track.requester.id" /></template
        ></span>
      </template>
      <template #trailing>
        <span class="flex items-center gap-4">
          <span class="text-label-medium text-on-surface-variant">{{
            track.isStream ? 'Live' : formatDuration(track.lengthMs)
          }}</span>
          <IconButton
            v-if="removable"
            variant="tonal"
            width="narrow"
            class="bg-error-container! text-on-error-container!"
            :label="`Remove ${track.title}`"
            :disabled="disabled"
            @click="emit('remove', track, index)"
          >
            <span class="icon [--icon-size:20px]" aria-hidden="true">delete</span>
          </IconButton>
        </span>
      </template>
    </ListItem>
  </List>
</template>
