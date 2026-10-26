/**
 * The colour of a "#1" rank in a ranked list, by its zero-based index: the top three take the
 * three accent roles in order (primary, secondary, tertiary), and the rest stay quiet.
 */
export function rankClass(index: number): string {
  return ['text-primary', 'text-secondary', 'text-tertiary'][index] ?? 'text-on-surface-variant'
}
