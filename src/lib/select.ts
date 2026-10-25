/** One choice in an AppSelect menu. Consecutive options sharing a `group` form a labelled section. */
export type SelectOption<T> = {
  value: T
  label: string
  /** A colour shown as a dot before the label, such as a Discord role's. */
  swatch?: string | null
  /** Secondary text at the end of the menu item, such as a username. */
  trailing?: string
  disabled?: boolean
  group?: string
}

/**
 * Gathers options of the same group together, keeping groups in the order they
 * first appear, so each group renders as one section and arrow keys move in
 * the order the menu shows.
 */
export function groupOptions<T>(options: SelectOption<T>[]): SelectOption<T>[] {
  const groups = new Map<string | undefined, SelectOption<T>[]>()
  for (const option of options) {
    const bucket = groups.get(option.group) ?? []
    bucket.push(option)
    groups.set(option.group, bucket)
  }
  return [...groups.values()].flat()
}
