/**
 * Lets the router scroll once the new page is in the document and the old one is pinned in
 * place, so scrolling moves only the new page.
 */

/** In case no page transition runs to say so. */
const FALLBACK_MS = 300

let waiting: (() => void) | null = null

/** Resolves when the incoming page is about to animate in. */
export function pageSwapped(): Promise<void> {
  waiting?.()
  return new Promise((resolve) => {
    const timer = setTimeout(done, FALLBACK_MS)
    function done() {
      clearTimeout(timer)
      if (waiting === done) waiting = null
      resolve()
    }
    waiting = done
  })
}

/** Called by the page transition as the new page goes in. */
export function notifyPageSwapped() {
  waiting?.()
}
