import { createSSRApp } from 'vue'
import { createPinia, type Pinia } from 'pinia'
import type { RouterHistory } from 'vue-router'

import App from './App.vue'
import { createAppRouter } from './router'
import './assets/main.css'

export function createApp(history?: RouterHistory) {
  const app = createSSRApp(App)
  const pinia: Pinia = createPinia()
  const router = createAppRouter(history)

  app.use(pinia)
  app.use(router)

  return { app, router, pinia }
}
