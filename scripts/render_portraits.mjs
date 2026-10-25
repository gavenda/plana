#!/usr/bin/env bun
/**
 * Renders her still portraits from her live rig, so a portrait that comes alive starts on
 * exactly the frame it showed: the idle animation and her face, both at their first frame.
 * Called by scripts/brand_assets.py, which cuts the renders to the badge.
 *
 *   bun scripts/render_portraits.mjs <out dir> <width> <height> <name>=<animation> ...
 *
 * Writes <out dir>/<name>.png, width x height, transparent. Uses the app's own Rigby2D
 * runtime (src/lib/rigby) in headless Chromium, with the framing in src/lib/plana-framing.json.
 * Needs a Chromium for Playwright: `bunx playwright install chromium`, or set CHROMIUM_PATH.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dir, '..')
const [outDir, width, height, ...pairs] = process.argv.slice(2)
if (!outDir || !width || !height || !pairs.length) {
  console.error('Usage: bun scripts/render_portraits.mjs <out dir> <width> <height> <name>=<animation> ...')
  process.exit(1)
}
const shots = pairs.map((p) => p.split('='))
const framing = JSON.parse(readFileSync(join(ROOT, 'src/lib/plana-framing.json'), 'utf8'))

const { chromium } = await import('playwright-core')

/** Playwright's own Chromium if installed, else CHROMIUM_PATH, else any Playwright build found. */
async function launch() {
  const args = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']
  try {
    return await chromium.launch({ args })
  } catch (err) {
    const candidates = [process.env.CHROMIUM_PATH]
    const cache = join(homedir(), '.cache', 'ms-playwright')
    if (existsSync(cache)) {
      for (const dir of readdirSync(cache).filter((d) => d.startsWith('chromium-')).sort().reverse()) {
        candidates.push(join(cache, dir, 'chrome-linux64', 'chrome'), join(cache, dir, 'chrome-linux', 'chrome'))
      }
    }
    const found = candidates.find((p) => p && existsSync(p))
    if (!found) throw err
    return chromium.launch({ executablePath: found, args })
  }
}

// Serves the runtime and the rig, and a page that draws one pose on request.
const PAGE = `<!doctype html><meta charset="utf-8"><canvas id="c"></canvas><script type="module">
import * as rigby from '/src/lib/rigby/runtime.js'
const framing = ${JSON.stringify(framing)}
const canvas = document.getElementById('c')
const gl = canvas.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: true, preserveDrawingBuffer: true })
const renderer = new rigby.WebGLRenderer(gl)
const base = '/src/assets/plana/rig/'
const [json, atlasText, blob] = await Promise.all([
  fetch(base + 'plana.json').then((r) => r.json()),
  fetch(base + 'plana.atlas').then((r) => r.text()),
  fetch(base + 'plana.webp').then((r) => r.blob()),
])
const skeleton = rigby.readSkeletonJson(json, 'plana').skeleton
const atlas = rigby.parseAtlas(atlasText)
const page = await createImageBitmap(blob, { premultiplyAlpha: 'none' })
const textures = renderer.atlasTextures(atlas, new Map([[atlas.pages[0].name, page]]), { mipmaps: true })
window.render = (face, w, h) => {
  canvas.width = w
  canvas.height = h
  const pose = new rigby.Pose(skeleton)
  const state = new rigby.AnimationState()
  state.setAnimation(skeleton, 0, 'Idle_01', true, 0)
  state.setAnimation(skeleton, 1, face, true, 0)
  state.update(skeleton, 0)
  state.apply(skeleton, pose)
  gl.viewport(0, 0, w, h)
  gl.clearColor(0, 0, 0, 0)
  gl.clear(gl.COLOR_BUFFER_BIT)
  const zoom = (w / framing.canvasWidth) * framing.scale
  renderer.begin(w, h, { x: framing.origin.x + w / 2 / zoom, y: framing.origin.y - h / 2 / zoom, zoom })
  renderer.drawSkeleton(skeleton, pose, textures)
  renderer.end()
  return canvas.toDataURL('image/png')
}
window.ready = true
</script>`

const TYPES = { '.js': 'text/javascript', '.json': 'application/json', '.atlas': 'text/plain', '.webp': 'image/webp' }
const server = Bun.serve({
  port: 0,
  fetch(req) {
    const path = decodeURIComponent(new URL(req.url).pathname)
    if (path === '/') return new Response(PAGE, { headers: { 'content-type': 'text/html' } })
    if (!/^\/src\/(lib\/rigby|assets\/plana\/rig)\/[\w./-]+$/.test(path) || path.includes('..')) {
      return new Response('Not found', { status: 404 })
    }
    const file = join(ROOT, path)
    if (!existsSync(file)) return new Response('Not found', { status: 404 })
    const type = TYPES[path.slice(path.lastIndexOf('.'))] ?? 'application/octet-stream'
    return new Response(Bun.file(file), { headers: { 'content-type': type } })
  },
})

const browser = await launch()
try {
  const tab = await browser.newPage()
  tab.on('pageerror', (e) => console.error('page error:', e.message))
  await tab.goto(`http://localhost:${server.port}/`)
  await tab.waitForFunction(() => window.ready === true, null, { timeout: 30000 })
  mkdirSync(outDir, { recursive: true })
  for (const [name, face] of shots) {
    const url = await tab.evaluate(([f, w, h]) => window.render(f, w, h), [face, +width, +height])
    writeFileSync(join(outDir, `${name}.png`), Buffer.from(url.split(',')[1], 'base64'))
  }
} finally {
  await browser.close()
  server.stop(true)
}
