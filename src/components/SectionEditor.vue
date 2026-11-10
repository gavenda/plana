<script setup lang="ts">
import { computed } from 'vue'
import { Button, Chip, IconButton, TextField } from 'tailwind-material3'

import ChoiceGroup from '@/components/ChoiceGroup.vue'
import { newLinkButton, newThumbnail, URL_HINT } from '@/lib/components-builder'
import { ComponentKind, type LinkButton, type Section, type Thumbnail } from '@/lib/components-v2'

/** A section: up to three texts, with a thumbnail or a link button beside them. */
const model = defineModel<Section>({ required: true })

const thumbnail = computed(() =>
  model.value.accessory.type === ComponentKind.Thumbnail
    ? (model.value.accessory as Thumbnail)
    : null,
)
const button = computed(() =>
  model.value.accessory.type === ComponentKind.Button
    ? (model.value.accessory as LinkButton)
    : null,
)

const accessory = computed({
  get: () => (button.value ? 'button' : 'thumbnail'),
  set: (value: 'button' | 'thumbnail') => {
    model.value.accessory = value === 'button' ? newLinkButton() : newThumbnail()
  },
})

function setSpoiler(value: boolean) {
  if (thumbnail.value) thumbnail.value.spoiler = value
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div v-for="(item, index) in model.components" :key="index" class="flex items-start gap-2">
      <div class="min-w-0 flex-1">
        <TextField
          variant="outlined"
          multiline
          :rows="6"
          v-model="item.content"
          :label="`Text ${index + 1}`"
          class="w-full"
        />
      </div>
      <IconButton
        variant="standard"
        label="Remove text"
        v-if="model.components.length > 1"
        @click="model.components.splice(index, 1)"
        class="mt-2"
      >
        <span class="icon [--icon-size:20px]" aria-hidden="true">close</span>
      </IconButton>
    </div>
    <Button
      variant="text"
      size="xs"
      v-if="model.components.length < 3"
      @click="model.components.push({ type: ComponentKind.TextDisplay, content: '' })"
      class="self-start"
      ><template #icon><span class="icon [--icon-size:20px]" aria-hidden="true">add</span></template
      >Add text</Button
    >

    <ChoiceGroup
      v-model="accessory"
      label="Beside the text"
      :options="[
        { value: 'thumbnail', label: 'Thumbnail', icon: 'image' },
        { value: 'button', label: 'Link button', icon: 'link' },
      ]"
    />

    <template v-if="thumbnail">
      <TextField
        variant="outlined"
        v-model="thumbnail.media.url"
        type="url"
        label="Image URL"
        class="w-full"
        :placeholder="URL_HINT"
      />
      <TextField
        variant="outlined"
        counter
        v-model="thumbnail.description"
        label="Alt text"
        :maxlength="1024"
        class="w-full"
      />
      <Chip
        class="self-start"
        type="filter"
        :selected="!!thumbnail.spoiler"
        @update:selected="setSpoiler"
        >Spoiler</Chip
      >
    </template>
    <div v-if="button" class="grid grid-cols-1 gap-4 medium:grid-cols-2">
      <TextField
        variant="outlined"
        counter
        v-model="button.label"
        label="Button label"
        :maxlength="80"
        class="w-full"
      />
      <TextField
        variant="outlined"
        v-model="button.url"
        type="url"
        label="Link"
        class="w-full"
        :placeholder="URL_HINT"
      />
    </div>
  </div>
</template>
