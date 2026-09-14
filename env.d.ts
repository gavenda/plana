/// <reference types="vite/client" />

import type { StateTree } from 'pinia'

declare global {
  interface Window {
    /** Pinia state serialized by the SSR renderer; removed once hydrated. */
    __PINIA__?: Record<string, StateTree>
  }
}

export {}
