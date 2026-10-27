<script setup lang="ts">
import AppTextField from '@/components/AppTextField.vue'
import { newLinkButton } from '@/lib/components-builder'
import type { ActionRow } from '@/lib/components-v2'

/** A row of up to five link buttons. */
const model = defineModel<ActionRow>({ required: true })
</script>

<template>
  <div class="flex flex-col gap-4">
    <div v-for="(button, index) in model.components" :key="index" class="flex items-start gap-2">
      <div class="grid min-w-0 flex-1 grid-cols-1 gap-4 medium:grid-cols-2">
        <AppTextField v-model="button.label" label="Button label" :maxlength="80" />
        <AppTextField v-model="button.url" input-type="url" label="Link" />
      </div>
      <button
        v-if="model.components.length > 1"
        type="button"
        class="icon-btn mt-2"
        aria-label="Remove button"
        @click="model.components.splice(index, 1)"
      >
        <span class="icon [--icon-size:20px]" aria-hidden="true">close</span>
      </button>
    </div>
    <button
      v-if="model.components.length < 5"
      type="button"
      class="btn btn-text btn-sm self-start"
      @click="model.components.push(newLinkButton())"
    >
      <span class="icon [--icon-size:18px]" aria-hidden="true">add</span>
      Add button
    </button>
    <p class="supporting-text">Link buttons only: Plana doesn't answer clicks on a broadcast.</p>
  </div>
</template>
