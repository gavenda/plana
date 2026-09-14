import { createApp } from './app'

const { app, router, pinia } = createApp()

// Adopt the state the server rendered with, before the router guard runs and asks
// whether there is a session.
if (window.__PINIA__) {
  pinia.state.value = window.__PINIA__
  delete window.__PINIA__
}

router.isReady().then(() => {
  app.mount('#app')
})
