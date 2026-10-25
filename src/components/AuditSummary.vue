<script setup lang="ts">
import DiscordMention from '@/components/DiscordMention.vue'
import type { SummaryPart } from '@/lib/audit'
import { useGuildStore } from '@/stores/guild'

/** An audit summary, with its Discord roles, channels and users drawn as mentions. */
defineProps<{ parts: SummaryPart[] }>()

const guild = useGuildStore()

type RolePart = { role: string | null; roleId: string | null }
type ChannelPart = { channel: string | null; channelId: string | null }

/** By id where the entry kept one, else by the stored name, for entries from before ids were. */
function findRole(part: RolePart) {
  return (
    guild.roles.find((candidate) => candidate.id === part.roleId) ??
    guild.roles.find((candidate) => candidate.name === part.role)
  )
}

/** Its current name, else the stored one, else Discord's own word for a role that has gone. */
function roleName(part: RolePart): string {
  return findRole(part)?.name ?? part.role ?? 'deleted-role'
}

function channelName(part: ChannelPart): string {
  const channel = guild.channels.find((candidate) => candidate.id === part.channelId)
  return channel?.name ?? part.channel ?? 'unknown'
}
</script>

<template>
  <template v-for="(part, index) in parts" :key="index">
    <template v-if="typeof part === 'string'">{{ part }}</template>
    <DiscordMention v-else-if="'user' in part" kind="user" :name="part.user" />
    <DiscordMention
      v-else-if="'role' in part"
      kind="role"
      :name="roleName(part)"
      :color="findRole(part)?.color"
    />
    <DiscordMention v-else kind="channel" :name="channelName(part)" />
  </template>
</template>
