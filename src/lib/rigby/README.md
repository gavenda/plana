# Rigby2D runtime (vendored)

The parts of [Rigby2D](https://github.com/jaisurya-dev-art/rigby2d)'s JavaScript runtime that
play Plana's live portraits: `core/` and `webgl/`, copied from commit `d52f239` (2026-11-19,
just after release v0.5.1). `draw.js`, `filmfx.js` and `scene.js` are only there because the
files the app uses import them.
Rigby2D is dual-licensed MIT or Apache-2.0 (`LICENSE-MIT`, `LICENSE-APACHE`). The app uses it
through `runtime.js` (typed in `runtime.d.ts`); see `src/lib/plana-live.ts`.

Patched to play Spine 3.8 rigs as Spine does (each patch is marked `Plana patch`):

- A timeline does nothing before its first key (bones, slots, deform, transform constraint
  mixes), so the setup pose shows until then. Upstream applied the first key early, which
  closed her eye 0.07s early at the start of a blink.
- Rotation keys turn the short way (`sampleRotation` in `core/animation.js`). Upstream turned
  the long way when two keys were more than 180° apart, spinning parts of her heart halo.
- `atlasTextures` takes `{ mipmaps: true }` (upstream's `createTexture` can mipmap, but
  `atlasTextures` doesn't pass it on). A portrait draws the 2048×1024 atlas at a
  fraction of its size, which without mipmaps leaves her edges jagged.

Rigby2D isn't published to npm (its `package.json` is the editor's, marked private), so it stays
vendored. To update: copy the same files from upstream's `src/core` and `src/webgl`, bring in
anything new they import, and re-apply the patches above.

Not formatted with the app's code (`.prettierignore`).
