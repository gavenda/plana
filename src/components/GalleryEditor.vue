<script setup lang="ts">
import { Button, Chip, IconButton, TextField } from 'tailwind-material3'
import { URL_HINT } from '@/lib/components-builder'
import type { MediaGallery } from '@/lib/components-v2'

/** A media gallery: up to ten images by URL. */
const model = defineModel<MediaGallery>({ required: true })
</script>

<template>
  <div class="flex flex-col gap-4">
    <div
      v-for="(item, index) in model.items"
      :key="index"
      class="flex flex-col gap-3 border-l-2 border-outline-variant pl-4"
    >
      <div class="flex items-start gap-2">
        <div class="min-w-0 flex-1">
          <TextField
            variant="outlined"
            v-model="item.media.url"
            type="url"
            :placeholder="URL_HINT"
            :label="`Image ${index + 1} URL`"
            class="w-full"
          />
        </div>
        <IconButton
          variant="standard"
          label="Remove image"
          v-if="model.items.length > 1"
          @click="model.items.splice(index, 1)"
          class="mt-2"
        >
          <span class="icon [--icon-size:20px]" aria-hidden="true">close</span>
        </IconButton>
      </div>
      <TextField
        variant="outlined"
        counter
        v-model="item.description"
        label="Alt text"
        :maxlength="1024"
        class="w-full"
      />
      <Chip
        class="self-start"
        type="filter"
        :selected="!!item.spoiler"
        @update:selected="item.spoiler = $event"
        >Spoiler</Chip
      >
    </div>
    <Button
      variant="text"
      size="xs"
      v-if="model.items.length < 10"
      @click="model.items.push({ media: { url: '' }, description: '' })"
      class="self-start"
      ><template #icon><span class="icon [--icon-size:20px]" aria-hidden="true">add</span></template
      >Add image</Button
    >
  </div>
</template>
