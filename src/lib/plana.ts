/**
 * Plana's moods, each a face of her live rig (MOOD_ANIMATION in plana-live.ts). A mood is chosen for its
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

/** Her logo: the mark at the top of the navigation rail. */
export const logoUrl = files['../assets/plana/logo.webp']!

/** The faint seaside scene behind the stand-alone pages (sign-in, 404). */
export const backdropUrl = files['../assets/plana/backdrop.webp']!

/** The sign-in scene: her fingerprint check, frame by frame, in the order they play. */
export const sceneUrls = {
  look: files['../assets/plana/scene-look.webp']!,
  raise: files['../assets/plana/scene-raise.webp']!,
  scan: files['../assets/plana/scene-scan.webp']!,
}
export type SceneFrame = keyof typeof sceneUrls
