# Rigby2D runtime (vendored)

The parts of [Rigby2D](https://github.com/jaisurya-dev-art/rigby2d)'s JavaScript runtime that
play Plana's live portraits: `core/` and `webgl/`, copied from commit `af53bfc` (2026-10-25).
Rigby2D is dual-licensed MIT or Apache-2.0 (`LICENSE-MIT`, `LICENSE-APACHE`). The app uses it
through `runtime.js` (typed in `runtime.d.ts`); see `src/lib/plana-live.ts`.

Patched to play Spine 3.8 rigs as Spine does (each patch is marked `Plana patch`):

- A timeline does nothing before its first key (bones, slots, deform, transform constraint
  mixes), so the setup pose shows until then. Upstream applied the first key early, which
  closed her eye 0.07s early at the start of a blink.
- Rotation keys turn the short way (`sampleRotation` in `core/animation.js`). Upstream turned
  the long way when two keys were more than 180° apart, spinning parts of her heart halo.
- `atlasTextures` takes `{ mipmaps: true }`. A portrait draws the 2048×1024 atlas at a
  fraction of its size, which without mipmaps leaves her edges jagged.

Not formatted with the app's code (`.prettierignore`).
