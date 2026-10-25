/**
 * Plana's live portraits: her rig from the game, played by the Rigby2D runtime (src/lib/rigby)
 * inside a portrait's badge. She breathes and blinks, and while Sensei presses and holds on
 * her she is patted: her head tilts towards the pointer and she shows her heart halo.
 *
 * The rig and the runtime load on first use and are shared by every portrait. Each portrait
 * draws to its own canvas, and only while it's on screen. See "Live portraits" in BRANDING.md.
 */
import type { PlanaMood } from '@/lib/plana'
import type { AnimationState, Pose, Skeleton, Textures, WebGLRenderer } from '@/lib/rigby/runtime'

import atlasUrl from '@/assets/plana/rig/plana.atlas?url'
import skeletonUrl from '@/assets/plana/rig/plana.json?url'
import pageUrl from '@/assets/plana/rig/plana.webp?url'
import framing from '@/lib/plana-framing.json'

/** Each mood's animation in the rig: the same numbers as the expressions in BRANDING.md. */
const MOOD_ANIMATION: Record<PlanaMood, string> = {
  standby: '01',
  content: '16',
  attentive: '08',
  curious: '09',
  asleep: '99',
  hesitant: '18',
  uneasy: '07',
  puzzled: '06',
  confused: '13',
  stern: '11',
}

/** Shown while she's patted: eyes closed, a blush and the heart halo. */
const PATTED = '17'

/**
 * Faces whose visible eye is already closed (a ">" wink, smiling shut, the heart halo,
 * asleep). She doesn't blink with these: the blink would open the eye for a moment.
 */
const EYES_CLOSED = new Set(['14', '15', '16', '17', '99'])

/** Where the rig sits in a portrait canvas; shared with the still portraits' renderer. */
const { origin: ORIGIN, scale: CANVAS_SCALE, canvasWidth: CANVAS_WIDTH } = framing

/** Animation tracks, bottom to top. */
const TRACK = { idle: 0, face: 1, look: 2, pat: 3, blink: 4 } as const
const MIX = 0.2

/** How far her head tilts towards the pointer while patted, in rig units, and the distance (px) to full tilt. */
const REACH_PATTED = 55
const FULL_TURN_PX = 280

interface Rig {
  runtime: typeof import('@/lib/rigby/runtime')
  skeleton: Skeleton
  atlas: ReturnType<typeof import('@/lib/rigby/runtime').parseAtlas>
  page: ImageBitmap
}

let rig: Promise<Rig> | null = null

function loadRig(): Promise<Rig> {
  rig ??= (async () => {
    const [runtime, skeletonJson, atlasText, pageBlob] = await Promise.all([
      import('@/lib/rigby/runtime'),
      fetch(skeletonUrl).then((r) => r.json()),
      fetch(atlasUrl).then((r) => r.text()),
      fetch(pageUrl).then((r) => r.blob()),
    ])
    const page = await createImageBitmap(pageBlob, { premultiplyAlpha: 'none' })
    return {
      runtime,
      skeleton: runtime.readSkeletonJson(skeletonJson, 'plana').skeleton,
      atlas: runtime.parseAtlas(atlasText),
      page,
    }
  })()
  rig.catch(() => (rig = null))
  return rig
}

/** Live portraits need WebGL; with reduced motion they are drawn but held still. */
export function livePortraitsSupported(): boolean {
  if (typeof window === 'undefined') return false
  return 'WebGLRenderingContext' in window
}

// One pointer, one frame loop, for every portrait on the page.
const portraits = new Set<LivePortrait>()
let pointer: { x: number; y: number } | null = null
let frame = 0
let last = 0

function onPointerMove(e: PointerEvent) {
  pointer = { x: e.clientX, y: e.clientY }
}
function onPointerLeave() {
  pointer = null
}

function tick(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000)
  last = now
  if (!document.hidden) for (const p of portraits) p.frame(dt)
  frame = requestAnimationFrame(tick)
}

function track(p: LivePortrait) {
  portraits.add(p)
  if (portraits.size > 1) return
  window.addEventListener('pointermove', onPointerMove, { passive: true })
  document.documentElement.addEventListener('pointerleave', onPointerLeave)
  last = performance.now()
  frame = requestAnimationFrame(tick)
}

function untrack(p: LivePortrait) {
  portraits.delete(p)
  if (portraits.size) return
  window.removeEventListener('pointermove', onPointerMove)
  document.documentElement.removeEventListener('pointerleave', onPointerLeave)
  cancelAnimationFrame(frame)
}

export class LivePortrait {
  private gl: WebGLRenderingContext
  private renderer!: WebGLRenderer
  private textures!: Textures
  private skeleton!: Skeleton
  private pose!: Pose
  private state!: AnimationState
  private touch = 0
  private touchParent = 0
  private head = 0
  private aim = { x: 0, y: 0 }
  private looking = false
  /** The face animation on show. */
  private face = ''

  private patting = false
  private visible = true
  private observer: IntersectionObserver
  private timers = new Map<number, number>()
  private blinkTimer = 0
  private disposed = false
  /** With reduced motion she holds her first frame: no breathing, no blinking. */
  private still = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  /** Resolves once she is drawn, so the still portrait can make way. */
  readonly ready: Promise<void>

  constructor(
    private canvas: HTMLCanvasElement,
    private mood: PlanaMood,
  ) {
    const gl = canvas.getContext('webgl', {
      premultipliedAlpha: true,
      alpha: true,
      antialias: true,
    })
    if (!gl) throw new Error('WebGL is unavailable')
    this.gl = gl
    this.observer = new IntersectionObserver(
      ([entry]) => (this.visible = entry?.isIntersecting ?? true),
    )
    this.observer.observe(canvas)
    this.ready = this.start()
  }

  private async start() {
    const { runtime, skeleton, atlas, page } = await loadRig()
    if (this.disposed) return
    this.renderer = new runtime.WebGLRenderer(this.gl)
    // A badge draws the atlas at a fraction of its size; mipmaps keep her edges smooth.
    this.textures = this.renderer.atlasTextures(atlas, new Map([[atlas.pages[0]!.name, page]]), {
      mipmaps: true,
    })
    this.skeleton = skeleton
    this.pose = new runtime.Pose(skeleton)
    this.state = new runtime.AnimationState()
    const bone = (name: string) => skeleton.bones.findIndex((b) => b.name === name)
    this.touch = bone('Touch_Point')
    this.touchParent = skeleton.bones[this.touch]!.parent ?? 0
    this.head = bone('Head_Rot')
    this.state.setAnimation(skeleton, TRACK.idle, 'Idle_01', true, 0)
    this.face = MOOD_ANIMATION[this.mood]
    this.state.setAnimation(skeleton, TRACK.face, this.face, true, 0)
    if (!this.still) this.scheduleBlink()
    track(this)
    this.frame(0)
  }

  setMood(mood: PlanaMood) {
    this.mood = mood
    if (this.state && !this.patting) this.showFace(MOOD_ANIMATION[mood])
  }

  /** Sensei presses on her: she is patted until `endPat`. */
  startPat() {
    if (!this.state || this.patting) return
    this.patting = true
    this.clearTimer(TRACK.pat)
    this.state.setAnimation(this.skeleton, TRACK.pat, 'Pat_01_M', true, MIX)
    this.showFace(PATTED)
  }

  endPat() {
    if (!this.patting) return
    this.patting = false
    this.once(TRACK.pat, 'PatEnd_01_M')
    this.showFace(MOOD_ANIMATION[this.mood])
  }

  dispose() {
    this.disposed = true
    untrack(this)
    this.observer.disconnect()
    for (const t of this.timers.values()) clearTimeout(t)
    clearTimeout(this.blinkTimer)
    this.renderer?.dispose()
    this.gl.getExtension('WEBGL_lose_context')?.loseContext()
  }

  private showFace(name: string) {
    this.face = name
    this.state.setAnimation(this.skeleton, TRACK.face, name, true, MIX)
    if (EYES_CLOSED.has(name)) {
      this.clearTimer(TRACK.blink)
      this.state.clearTrack(TRACK.blink)
    }
  }

  private clearTimer(trackIndex: number) {
    clearTimeout(this.timers.get(trackIndex))
    this.timers.delete(trackIndex)
  }

  /** Plays a one-shot animation on a track, then empties the track when it ends. */
  private once(trackIndex: number, name: string) {
    this.clearTimer(trackIndex)
    this.state.setAnimation(this.skeleton, trackIndex, name, false, MIX)
    const duration = this.skeleton.animations.find((a) => a.name === name)?.duration ?? 0
    this.timers.set(
      trackIndex,
      window.setTimeout(() => this.state.clearTrack(trackIndex), (duration + 0.05) * 1000),
    )
  }

  private scheduleBlink() {
    this.blinkTimer = window.setTimeout(
      () => {
        if (!EYES_CLOSED.has(this.face)) this.once(TRACK.blink, 'Eye_Close_01')
        this.scheduleBlink()
      },
      2500 + Math.random() * 3500,
    )
  }

  private look(on: boolean) {
    if (on === this.looking) return
    this.looking = on
    if (on) {
      this.clearTimer(TRACK.look)
      this.state.setAnimation(this.skeleton, TRACK.look, 'Look_01_M', true, MIX)
    } else this.once(TRACK.look, 'LookEnd_01_M')
  }

  /** CSS pixels per rig unit, and the rig point at the canvas's top-left corner. */
  private camera(width: number) {
    const zoom = (width / CANVAS_WIDTH) * CANVAS_SCALE
    return { zoom, x: ORIGIN.x, y: ORIGIN.y }
  }

  frame(dt: number) {
    if (!this.state || !this.visible) return
    // Held still, she moves only while patted, which Sensei asked for by pressing on her.
    if (this.still && !this.patting && !this.timers.has(TRACK.pat)) dt = 0
    const { canvas, gl, skeleton, pose, state } = this
    const rect = canvas.getBoundingClientRect()
    if (!rect.width || !rect.height) return
    const dpr = window.devicePixelRatio || 1
    const w = Math.round(rect.width * dpr)
    const h = Math.round(rect.height * dpr)
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
    }
    const cam = this.camera(rect.width)

    state.update(skeleton, dt)
    state.apply(skeleton, pose)

    // While patted, her head tilts towards the pointer: move Touch_Point, in its parent's
    // space, within reach. She doesn't follow the pointer otherwise.
    let tx = 0
    let ty = 0
    this.look(this.patting)
    if (pointer && this.patting) {
      const head = pose.world[this.head]!
      const hx = rect.left + (head.tx - cam.x) * cam.zoom
      const hy = rect.top + (cam.y - head.ty) * cam.zoom
      const px = pointer.x - hx
      const py = hy - pointer.y
      const len = Math.hypot(px, py)
      if (len > 0) {
        const reach = REACH_PATTED
        const k = (reach * Math.min(1, len / FULL_TURN_PX)) / len
        const dx = px * k
        const dy = py * k
        const p = pose.world[this.touchParent]!
        const det = p.a * p.d - p.c * p.b
        tx = (p.d * dx - p.c * dy) / det
        ty = (p.a * dy - p.b * dx) / det
      }
    }
    const ease = 1 - Math.pow(0.001, dt) // settles in about a second, at any frame rate
    this.aim.x += (tx - this.aim.x) * ease
    this.aim.y += (ty - this.aim.y) * ease
    pose.local[this.touch]!.x += this.aim.x
    pose.local[this.touch]!.y += this.aim.y
    pose.updateWorld(skeleton)

    gl.viewport(0, 0, w, h)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    const zoom = cam.zoom * dpr
    // The renderer centres its camera; ours is pinned at the top-left corner.
    this.renderer.begin(w, h, { x: cam.x + w / 2 / zoom, y: cam.y - h / 2 / zoom, zoom })
    this.renderer.drawSkeleton(skeleton, pose, this.textures)
    this.renderer.end()
  }
}
