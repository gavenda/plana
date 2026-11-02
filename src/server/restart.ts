/**
 * Lets a module ask for the bot to restart without importing the entry point. `index.ts` sets
 * the handler, which shuts down cleanly and exits for the service manager to start it again.
 */
let handler: (() => void) | null = null

export function setRestartHandler(fn: () => void): void {
  handler = fn
}

export function restart(): void {
  if (handler) handler()
  else process.exit(75)
}
