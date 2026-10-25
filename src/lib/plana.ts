/**
 * Plana's moods, each a portrait cut by scripts/brand_assets.py. A mood is chosen for its
 * halo as much as its face; see "Plana's portraits" in BRANDING.md before adding a place.
 */
export type PlanaMood =
  | 'standby'
  | 'content'
  | 'attentive'
  | 'curious'
  | 'asleep'
  | 'hesitant'
  | 'uneasy'
  | 'puzzled'
  | 'confused'
  | 'stern'

const files = import.meta.glob<string>('../assets/plana/*.webp', {
  eager: true,
  import: 'default',
})

export function portraitUrl(mood: PlanaMood): string {
  const url = files[`../assets/plana/${mood}.webp`]
  if (!url) throw new Error(`No portrait for mood "${mood}". Run scripts/brand_assets.py.`)
  return url
}

/** Her logo: the mark at the top of the navigation rail. */
export const logoUrl = files['../assets/plana/logo.webp']!

/** The faint seaside scene behind the stand-alone pages (sign-in, 404). */
export const backdropUrl = files['../assets/plana/backdrop.webp']!
