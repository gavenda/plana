export type Span = { start: number; end: number }

/** Spans merged so overlapping time counts once, in start order. */
export function union(spans: Span[]): Span[] {
  const sorted = [...spans].sort((a, b) => a.start - b.start)
  const merged: Span[] = []
  for (const span of sorted) {
    const last = merged.at(-1)
    if (last && span.start <= last.end) last.end = Math.max(last.end, span.end)
    else merged.push({ ...span })
  }
  return merged
}
