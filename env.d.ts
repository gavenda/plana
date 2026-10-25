/// <reference types="vite/client" />

import type { StateTree } from 'pinia'

declare global {
  /** package.json's version, injected by vite.config.ts. */
  const __APP_VERSION__: string

  interface Window {
    /** Pinia state serialized by the SSR renderer; removed once hydrated. */
    __PINIA__?: Record<string, StateTree>
  }
}

export {}
