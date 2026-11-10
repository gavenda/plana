<script setup lang="ts">
import { Button, IconButton, TextField } from 'tailwind-material3'
import { newLinkButton, URL_HINT } from '@/lib/components-builder'
import type { ActionRow } from '@/lib/components-v2'

/** A row of up to five link buttons. */
const model = defineModel<ActionRow>({ required: true })
</script>

<template>
  <div class="flex flex-col gap-4">
    <div v-for="(button, index) in model.components" :key="index" class="flex items-start gap-2">
      <div class="grid min-w-0 flex-1 grid-cols-1 gap-4 medium:grid-cols-2">
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
      <IconButton
        variant="standard"
        label="Remove button"
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
      v-if="model.components.length < 5"
      @click="model.components.push(newLinkButton())"
      class="self-start"
      ><template #icon><span class="icon [--icon-size:20px]" aria-hidden="true">add</span></template
      >Add button</Button
    >
    <p class="supporting-text">Link buttons only: Plana doesn't answer clicks on a broadcast.</p>
  </div>
</template>
