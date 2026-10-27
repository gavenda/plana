<script setup lang="ts">
import { computed } from 'vue'

import DiscordBlocks from '@/components/DiscordBlocks.vue'
import { parseMarkdown } from '@/lib/discord-markdown'

/**
 * Message text drawn as Discord will: its markdown, channel and role mentions by their current
 * names, @everyone and @here, and custom emoji. Block-level, so put it in a <div>, not a <p>.
 */
const props = defineProps<{ content: string }>()

const blocks = computed(() => parseMarkdown(props.content))
</script>

<template>
  <div class="flex flex-col gap-1 [overflow-wrap:anywhere]">
    <DiscordBlocks :blocks="blocks" />
  </div>
</template>
