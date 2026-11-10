<script setup lang="ts">
import { computed } from 'vue'
import { Button, IconButton } from 'tailwind-material3'

import ComponentEditor from '@/components/ComponentEditor.vue'
import {
  BLOCK_KINDS,
  CHILD_KINDS,
  blockKey,
  blockKind,
  type AnyBlock,
} from '@/lib/components-builder'

/**
 * The parts of a Components V2 layout, in order, each with its editor, plus a row for adding
 * more. Inside a container it is `nested`, which leaves out adding another container.
 */
const props = defineProps<{ nested?: boolean }>()

const model = defineModel<AnyBlock[]>({ required: true })

const kinds = computed(() => (props.nested ? CHILD_KINDS : BLOCK_KINDS))

function add(type: number) {
  const kind = blockKind(type)
  if (kind) model.value.push(kind.create())
}

function move(index: number, step: -1 | 1) {
  const target = index + step
  if (target < 0 || target >= model.value.length) return
  const [block] = model.value.splice(index, 1)
  model.value.splice(target, 0, block!)
}

function remove(index: number) {
  model.value.splice(index, 1)
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <div
      v-for="(block, index) in model"
      :key="blockKey(block)"
      class="flex flex-col gap-4 rounded-medium p-4"
      :class="nested ? 'bg-surface-container-highest' : 'bg-surface-container-high'"
    >
      <div class="-my-1 -mr-2 flex items-center gap-3">
        <span class="icon text-on-surface-variant [--icon-size:20px]" aria-hidden="true">
          {{ blockKind(block.type)?.icon ?? 'widgets' }}
        </span>
        <span class="text-title-small">{{ blockKind(block.type)?.label ?? 'Component' }}</span>
        <span class="flex-1" />
        <IconButton
          variant="standard"
          label="Move up"
          :disabled="index === 0"
          @click="move(index, -1)"
        >
          <span class="icon [--icon-size:20px]" aria-hidden="true">arrow_upward</span>
        </IconButton>
        <IconButton
          variant="standard"
          label="Move down"
          :disabled="index === model.length - 1"
          @click="move(index, 1)"
        >
          <span class="icon [--icon-size:20px]" aria-hidden="true">arrow_downward</span>
        </IconButton>
        <IconButton variant="standard" label="Remove" @click="remove(index)">
          <span class="icon [--icon-size:20px]" aria-hidden="true">delete</span>
        </IconButton>
      </div>

      <ComponentEditor v-model="model[index]!" />
    </div>

    <p v-if="model.length === 0" class="supporting-text">
      {{ nested ? 'Nothing in this container yet.' : 'Add a part to start the message.' }}
    </p>

    <div
      class="flex flex-wrap gap-2"
      role="group"
      :aria-label="nested ? 'Add to container' : 'Add'"
    >
      <Button
        variant="tonal"
        size="xs"
        v-for="kind in kinds"
        :key="kind.type"
        @click="add(kind.type)"
        ><template #icon
          ><span class="icon [--icon-size:20px]" aria-hidden="true">add</span></template
        >{{ kind.label }}</Button
      >
    </div>
  </div>
</template>
