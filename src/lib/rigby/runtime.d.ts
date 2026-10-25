// Types for the parts of the Rigby2D runtime in runtime.js; only what the app uses.

export interface Affine {
  a: number
  b: number
  c: number
  d: number
  tx: number
  ty: number
}

export interface Transform {
  x: number
  y: number
  rotation: number
  scale_x: number
  scale_y: number
}

export interface Bone {
  name: string
  /** Index of the parent bone; null for the root. */
  parent: number | null
}

export interface Skeleton {
  bones: Bone[]
  animations: { name: string; duration: number }[]
}

export interface Atlas {
  pages: { name: string }[]
}

export interface Camera {
  x: number
  y: number
  /** Device pixels per skeleton unit. */
  zoom: number
}

export type Textures = unknown

export function parseAtlas(text: string): Atlas
export function readSkeletonJson(obj: unknown, name?: string): { skeleton: Skeleton; warnings: string[] }

export class Pose {
  constructor(sk: Skeleton)
  local: Transform[]
  world: Affine[]
  updateWorld(sk: Skeleton): void
}

export class AnimationState {
  setAnimation(sk: Skeleton, track: number, name: string, looping: boolean, mix?: number): unknown
  clearTrack(track: number): void
  update(sk: Skeleton, dt: number): void
  apply(sk: Skeleton, pose: Pose): void
}

export class WebGLRenderer {
  constructor(gl: WebGLRenderingContext | WebGL2RenderingContext)
  /** `mipmaps` (Plana patch) is for drawing the atlas well below its size. */
  atlasTextures(atlas: Atlas, pages: Map<string, ImageBitmap>, options?: { mipmaps?: boolean }): Textures
  begin(width: number, height: number, camera: Camera): void
  drawSkeleton(sk: Skeleton, pose: Pose, textures: Textures): void
  end(): void
  dispose(): void
}
