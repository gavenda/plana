<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { Card } from 'tailwind-material3'

import LinkButton from '@/components/LinkButton.vue'
import PlanaSays from '@/components/PlanaSays.vue'
</script>

<template>
  <div class="flex w-full justify-center">
    <Card
      variant="elevated"
      :padded="false"
      class="flex w-full max-w-[400px] flex-col items-center gap-4 px-10 py-12 text-center"
    >
      <PlanaSays mood="puzzled" layout="column">
        This place is... I see. There's nothing here.
      </PlanaSays>
      <h1 class="text-display-large font-medium text-primary">404</h1>
      <p class="text-body-large text-on-surface-variant">That page does not exist.</p>
      <LinkButton variant="tonal" class="mt-2" to="/">Back to overview</LinkButton>
    </Card>
  </div>
</template>
