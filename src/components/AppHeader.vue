<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'

import { useGuildStore } from '@/stores/guild'
import { useSessionStore } from '@/stores/session'

const route = useRoute()
const session = useSessionStore()
const guild = useGuildStore()
const signingOut = ref(false)

onMounted(() => {
  void guild.load()
})

async function signOut() {
  signingOut.value = true
  try {
    await fetch('/auth/logout', { method: 'POST', credentials: 'same-origin' })
  } finally {
    window.location.href = '/login'
  }
}
</script>

<template>
  <header
    class="flex items-center justify-between gap-5 border-b border-line bg-surface px-4 py-3.5 md:px-7 md:py-[18px]"
  >
    <div>
      <h1 class="text-[19px] font-semibold tracking-tight">{{ route.meta.title }}</h1>
      <p v-if="guild.directory" class="text-[13px] text-faint">
        {{ guild.directory.guild.name }} · {{ guild.directory.guild.memberCount }} members
      </p>
    </div>

    <div v-if="session.user" class="flex items-center gap-2.5">
      <img
        v-if="session.user.avatar"
        class="shrink-0 rounded-full bg-raised object-cover"
        :src="session.user.avatar"
        :alt="session.user.displayName"
        width="30"
        height="30"
      />
      <span class="hidden text-sm font-medium md:inline">{{ session.user.displayName }}</span>
      <button class="btn btn-ghost btn-sm" :disabled="signingOut" @click="signOut">Sign out</button>
    </div>
  </header>
</template>
