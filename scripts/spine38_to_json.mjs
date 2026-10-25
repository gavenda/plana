#!/usr/bin/env bun
/**
 * Converts a Spine 3.8 binary skeleton (.skel) into Spine 3.8 skeleton JSON, so the rig can be
 * opened by tools that read 3.8 JSON but not 3.8 binary (Rigby2D, for one).
 *
 *   bun scripts/spine38_to_json.mjs branding/NP0035_spr/NP0035_spr.skel [out.json]
 *
 * Writes next to the input by default. Curves keep their original Bézier control points, so the
 * JSON plays the same as the binary. Field names and defaults follow the 3.8 JSON format.
 */
import { readFileSync, writeFileSync } from 'node:fs'

const TRANSFORM_MODES = ['normal', 'onlyTranslation', 'noRotationOrReflection', 'noScale', 'noScaleOrReflection']
const BLEND_MODES = ['normal', 'additive', 'multiply', 'screen']
const POSITION_MODES = ['fixed', 'percent']
const SPACING_MODES = ['length', 'fixed', 'percent']
const ROTATE_MODES = ['tangent', 'chain', 'chainScale']
const ATTACHMENT_TYPES = ['region', 'boundingbox', 'mesh', 'linkedmesh', 'path', 'point', 'clipping']

class Reader {
  constructor(bytes) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    this.p = 0
    this.strings = []
  }
  byte() {
    return this.view.getInt8(this.p++)
  }
  ubyte() {
    return this.view.getUint8(this.p++)
  }
  bool() {
    return this.ubyte() !== 0
  }
  short() {
    const v = this.view.getInt16(this.p)
    this.p += 2
    return v
  }
  int32() {
    const v = this.view.getInt32(this.p)
    this.p += 4
    return v
  }
  /** Variable-length int, 1 to 5 bytes. Zigzag-decoded unless `optimizePositive`. */
  varint(optimizePositive = true) {
    let b = this.ubyte()
    let result = b & 0x7f
    for (let shift = 7; b & 0x80 && shift <= 28; shift += 7) {
      b = this.ubyte()
      result |= (b & 0x7f) << shift
    }
    return optimizePositive ? result | 0 : (result >>> 1) ^ -(result & 1)
  }
  float() {
    const v = this.view.getFloat32(this.p)
    this.p += 4
    return round(v)
  }
  string() {
    const count = this.varint()
    if (count === 0) return null
    if (count === 1) return ''
    const bytes = new Uint8Array(this.view.buffer, this.view.byteOffset + this.p, count - 1)
    this.p += count - 1
    return new TextDecoder().decode(bytes)
  }
  stringRef() {
    const i = this.varint()
    return i === 0 ? null : this.strings[i - 1]
  }
  floats(n) {
    return Array.from({ length: n }, () => this.float())
  }
  shorts() {
    return Array.from({ length: this.varint() }, () => this.short())
  }
}

/**
 * Each float is written as the exact value of the stored float32. A shorter decimal would read
 * back as the same float32, but runtimes in JavaScript compute in float64, where it would differ
 * slightly from what the binary gives them.
 */
const round = (v) => v

const hex = (n, bytes) => (n >>> 0).toString(16).padStart(8, '0').slice(0, bytes * 2)
const rgba = (n) => hex(n, 4)
const rgb = (n) => ((n >>> 0) & 0xffffff).toString(16).padStart(6, '0')

/** Drops fields that equal their 3.8 JSON default, to keep the file readable. */
function compact(obj, defaults) {
  for (const [k, d] of Object.entries(defaults)) if (obj[k] === d) delete obj[k]
  for (const k of Object.keys(obj)) if (obj[k] === undefined || obj[k] === null) delete obj[k]
  return obj
}

export function convert(bytes) {
  const r = new Reader(bytes)
  const json = {}

  const skeleton = { hash: r.string(), spine: r.string(), x: r.float(), y: r.float(), width: r.float(), height: r.float() }
  if (!/^3\.8/.test(skeleton.spine ?? '')) throw new Error(`Not a Spine 3.8 binary (version ${skeleton.spine})`)
  const nonessential = r.bool()
  if (nonessential) {
    skeleton.fps = r.float()
    skeleton.images = r.string()
    skeleton.audio = r.string()
  }
  json.skeleton = compact(skeleton, { images: '', audio: '' })

  for (let i = 0, n = r.varint(); i < n; i++) r.strings.push(r.string())

  // Bones.
  const bones = []
  for (let i = 0, n = r.varint(); i < n; i++) {
    const bone = { name: r.string() }
    if (i > 0) bone.parent = bones[r.varint()].name
    Object.assign(bone, {
      rotation: r.float(), x: r.float(), y: r.float(), scaleX: r.float(), scaleY: r.float(),
      shearX: r.float(), shearY: r.float(), length: r.float(),
      transform: TRANSFORM_MODES[r.varint()], skin: r.bool(),
    })
    if (nonessential) bone.color = rgba(r.int32())
    bones.push(compact(bone, { rotation: 0, x: 0, y: 0, scaleX: 1, scaleY: 1, shearX: 0, shearY: 0, length: 0, transform: 'normal', skin: false }))
  }
  json.bones = bones

  // Slots.
  const slots = []
  for (let i = 0, n = r.varint(); i < n; i++) {
    const slot = { name: r.string(), bone: bones[r.varint()].name, color: rgba(r.int32()) }
    const dark = r.int32()
    if (dark !== -1) slot.dark = rgb(dark)
    slot.attachment = r.stringRef()
    slot.blend = BLEND_MODES[r.varint()]
    slots.push(compact(slot, { color: 'ffffffff', blend: 'normal' }))
  }
  json.slots = slots

  const boneList = () => Array.from({ length: r.varint() }, () => bones[r.varint()].name)

  // IK constraints.
  const ik = []
  for (let i = 0, n = r.varint(); i < n; i++) {
    const c = { name: r.string(), order: r.varint(), skin: r.bool(), bones: boneList(), target: bones[r.varint()].name }
    Object.assign(c, { mix: r.float(), softness: r.float(), bendPositive: r.byte() !== -1, compress: r.bool(), stretch: r.bool(), uniform: r.bool() })
    ik.push(compact(c, { skin: false, mix: 1, softness: 0, bendPositive: true, compress: false, stretch: false, uniform: false }))
  }
  if (ik.length) json.ik = ik

  // Transform constraints.
  const transform = []
  for (let i = 0, n = r.varint(); i < n; i++) {
    const c = { name: r.string(), order: r.varint(), skin: r.bool(), bones: boneList(), target: bones[r.varint()].name }
    Object.assign(c, {
      local: r.bool(), relative: r.bool(),
      rotation: r.float(), x: r.float(), y: r.float(), scaleX: r.float(), scaleY: r.float(), shearY: r.float(),
      rotateMix: r.float(), translateMix: r.float(), scaleMix: r.float(), shearMix: r.float(),
    })
    transform.push(compact(c, { skin: false, local: false, relative: false, rotation: 0, x: 0, y: 0, scaleX: 0, scaleY: 0, shearY: 0, rotateMix: 1, translateMix: 1, scaleMix: 1, shearMix: 1 }))
  }
  if (transform.length) json.transform = transform

  // Path constraints.
  const path = []
  for (let i = 0, n = r.varint(); i < n; i++) {
    const c = { name: r.string(), order: r.varint(), skin: r.bool(), bones: boneList(), target: slots[r.varint()].name }
    Object.assign(c, {
      positionMode: POSITION_MODES[r.varint()], spacingMode: SPACING_MODES[r.varint()], rotateMode: ROTATE_MODES[r.varint()],
      rotation: r.float(), position: r.float(), spacing: r.float(), rotateMix: r.float(), translateMix: r.float(),
    })
    path.push(compact(c, { skin: false, positionMode: 'percent', spacingMode: 'length', rotateMode: 'tangent', rotation: 0, position: 0, spacing: 0, rotateMix: 1, translateMix: 1 }))
  }
  if (path.length) json.path = path

  // Skins: the default one first (when it has attachments), then the named ones.
  const vertices = (vertexCount) => {
    if (!r.bool()) return r.floats(vertexCount * 2)
    const out = []
    for (let i = 0; i < vertexCount; i++) {
      const boneCount = r.varint()
      out.push(boneCount)
      for (let b = 0; b < boneCount; b++) out.push(r.varint(), r.float(), r.float(), r.float())
    }
    return out
  }
  const attachment = (key) => {
    const name = r.stringRef() ?? key
    const type = ATTACHMENT_TYPES[r.byte()]
    const a = { type, name: name === key ? undefined : name }
    switch (type) {
      case 'region': {
        const p = r.stringRef()
        Object.assign(a, { type: undefined, path: p === name ? undefined : p ?? undefined })
        Object.assign(a, { rotation: r.float(), x: r.float(), y: r.float(), scaleX: r.float(), scaleY: r.float(), width: r.float(), height: r.float(), color: rgba(r.int32()) })
        return compact(a, { rotation: 0, x: 0, y: 0, scaleX: 1, scaleY: 1, color: 'ffffffff' })
      }
      case 'boundingbox': {
        a.vertexCount = r.varint()
        a.vertices = vertices(a.vertexCount)
        if (nonessential) a.color = rgba(r.int32())
        return compact(a, {})
      }
      case 'mesh': {
        const p = r.stringRef()
        a.path = p === name ? undefined : p ?? undefined
        a.color = rgba(r.int32())
        const vertexCount = r.varint()
        a.uvs = r.floats(vertexCount * 2)
        a.triangles = r.shorts()
        a.vertices = vertices(vertexCount)
        a.hull = r.varint()
        if (nonessential) {
          a.edges = r.shorts()
          a.width = r.float()
          a.height = r.float()
        }
        return compact(a, { color: 'ffffffff' })
      }
      case 'linkedmesh': {
        const p = r.stringRef()
        a.path = p === name ? undefined : p ?? undefined
        a.color = rgba(r.int32())
        a.skin = r.stringRef()
        a.parent = r.stringRef()
        a.deform = r.bool()
        if (nonessential) {
          a.width = r.float()
          a.height = r.float()
        }
        return compact(a, { color: 'ffffffff', deform: true })
      }
      case 'path': {
        a.closed = r.bool()
        a.constantSpeed = r.bool()
        a.vertexCount = r.varint()
        a.vertices = vertices(a.vertexCount)
        a.lengths = r.floats(a.vertexCount / 3)
        if (nonessential) a.color = rgba(r.int32())
        return compact(a, { closed: false, constantSpeed: true })
      }
      case 'point': {
        Object.assign(a, { rotation: r.float(), x: r.float(), y: r.float() })
        if (nonessential) a.color = rgba(r.int32())
        return compact(a, { rotation: 0, x: 0, y: 0 })
      }
      case 'clipping': {
        a.end = slots[r.varint()].name
        a.vertexCount = r.varint()
        a.vertices = vertices(a.vertexCount)
        if (nonessential) a.color = rgba(r.int32())
        return compact(a, {})
      }
      default:
        throw new Error(`Unknown attachment type at byte ${r.p}`)
    }
  }
  const skin = (isDefault) => {
    const s = {}
    let slotCount
    if (isDefault) {
      slotCount = r.varint()
      if (slotCount === 0) return null
      s.name = 'default'
    } else {
      s.name = r.stringRef()
      const sb = boneList()
      const sik = Array.from({ length: r.varint() }, () => ik[r.varint()].name)
      const st = Array.from({ length: r.varint() }, () => transform[r.varint()].name)
      const sp = Array.from({ length: r.varint() }, () => path[r.varint()].name)
      if (sb.length) s.bones = sb
      if (sik.length) s.ik = sik
      if (st.length) s.transform = st
      if (sp.length) s.path = sp
      slotCount = r.varint()
    }
    s.attachments = {}
    for (let i = 0; i < slotCount; i++) {
      const slotName = slots[r.varint()].name
      const entries = (s.attachments[slotName] = {})
      for (let j = 0, n = r.varint(); j < n; j++) {
        const key = r.stringRef()
        entries[key] = attachment(key)
      }
    }
    return s
  }
  const skins = []
  const def = skin(true)
  if (def) skins.push(def)
  for (let i = 0, n = r.varint(); i < n; i++) skins.push(skin(false))
  json.skins = skins

  // Events.
  const events = []
  json.events = {}
  for (let i = 0, n = r.varint(); i < n; i++) {
    const name = r.stringRef()
    const e = { int: r.varint(false), float: r.float(), string: r.string(), audio: r.string() }
    if (e.audio !== null) {
      e.volume = r.float()
      e.balance = r.float()
    }
    events.push({ name, ...e })
    json.events[name] = compact(e, { int: 0, float: 0, volume: 1, balance: 0 })
  }
  if (!events.length) delete json.events

  // Animations.
  json.animations = {}
  for (let i = 0, n = r.varint(); i < n; i++) {
    const name = r.string()
    json.animations[name] = animation()
  }
  if (r.p !== bytes.byteLength) throw new Error(`${bytes.byteLength - r.p} bytes left after the animations`)
  return json

  /** Reads the curve after every keyframe but the last, into 3.8's curve/c2/c3/c4 fields. */
  function curve(frame) {
    switch (r.byte()) {
      case 1:
        frame.curve = 'stepped'
        break
      case 2:
        frame.curve = r.float()
        frame.c2 = r.float()
        frame.c3 = r.float()
        frame.c4 = r.float()
        break
    }
  }
  function frames(count, readFrame) {
    const out = []
    for (let f = 0; f < count; f++) {
      const frame = readFrame()
      if (f < count - 1 && !('__noCurve' in frame)) curve(frame)
      delete frame.__noCurve
      out.push(frame)
    }
    return out
  }

  function animation() {
    const anim = {}

    const slotTimelines = {}
    for (let i = 0, n = r.varint(); i < n; i++) {
      const slot = (slotTimelines[slots[r.varint()].name] = {})
      for (let j = 0, m = r.varint(); j < m; j++) {
        const type = r.byte()
        const count = r.varint()
        if (type === 0) slot.attachment = frames(count, () => ({ time: r.float(), name: r.stringRef(), __noCurve: true }))
        else if (type === 1) slot.color = frames(count, () => ({ time: r.float(), color: rgba(r.int32()) }))
        else if (type === 2) slot.twoColor = frames(count, () => ({ time: r.float(), light: rgba(r.int32()), dark: rgb(r.int32()) }))
        else throw new Error(`Unknown slot timeline ${type}`)
      }
    }
    if (Object.keys(slotTimelines).length) anim.slots = slotTimelines

    const boneTimelines = {}
    for (let i = 0, n = r.varint(); i < n; i++) {
      const bone = (boneTimelines[bones[r.varint()].name] = {})
      for (let j = 0, m = r.varint(); j < m; j++) {
        const type = r.byte()
        const count = r.varint()
        if (type === 0) bone.rotate = frames(count, () => ({ time: r.float(), angle: r.float() }))
        else if (type <= 3) bone[['', 'translate', 'scale', 'shear'][type]] = frames(count, () => ({ time: r.float(), x: r.float(), y: r.float() }))
        else throw new Error(`Unknown bone timeline ${type}`)
      }
    }
    if (Object.keys(boneTimelines).length) anim.bones = boneTimelines

    const ikTimelines = {}
    for (let i = 0, n = r.varint(); i < n; i++) {
      const c = ik[r.varint()].name
      ikTimelines[c] = frames(r.varint(), () => ({
        time: r.float(), mix: r.float(), softness: r.float(), bendPositive: r.byte() !== -1, compress: r.bool(), stretch: r.bool(),
      }))
    }
    if (Object.keys(ikTimelines).length) anim.ik = ikTimelines

    const transformTimelines = {}
    for (let i = 0, n = r.varint(); i < n; i++) {
      const c = transform[r.varint()].name
      transformTimelines[c] = frames(r.varint(), () => ({
        time: r.float(), rotateMix: r.float(), translateMix: r.float(), scaleMix: r.float(), shearMix: r.float(),
      }))
    }
    if (Object.keys(transformTimelines).length) anim.transform = transformTimelines

    const pathTimelines = {}
    for (let i = 0, n = r.varint(); i < n; i++) {
      const c = (pathTimelines[path[r.varint()].name] = {})
      for (let j = 0, m = r.varint(); j < m; j++) {
        const type = r.byte()
        const count = r.varint()
        if (type === 0) c.position = frames(count, () => ({ time: r.float(), position: r.float() }))
        else if (type === 1) c.spacing = frames(count, () => ({ time: r.float(), spacing: r.float() }))
        else if (type === 2) c.mix = frames(count, () => ({ time: r.float(), rotateMix: r.float(), translateMix: r.float() }))
        else throw new Error(`Unknown path timeline ${type}`)
      }
    }
    if (Object.keys(pathTimelines).length) anim.path = pathTimelines

    // Deform keys hold deltas from the setup vertices, stored from `offset`, as in the JSON.
    const deform = {}
    for (let i = 0, n = r.varint(); i < n; i++) {
      const skinName = skins[r.varint()].name
      const bySlot = (deform[skinName] ??= {})
      for (let j = 0, m = r.varint(); j < m; j++) {
        const byAttachment = (bySlot[slots[r.varint()].name] ??= {})
        for (let k = 0, o = r.varint(); k < o; k++) {
          const att = r.stringRef()
          byAttachment[att] = frames(r.varint(), () => {
            const frame = { time: r.float() }
            const end = r.varint()
            if (end !== 0) {
              const offset = r.varint()
              if (offset) frame.offset = offset
              frame.vertices = r.floats(end)
            }
            return frame
          })
        }
      }
    }
    if (Object.keys(deform).length) anim.deform = deform

    const drawOrder = []
    for (let i = 0, n = r.varint(); i < n; i++) {
      const key = { time: r.float() }
      const offsets = []
      for (let j = 0, m = r.varint(); j < m; j++) offsets.push({ slot: slots[r.varint()].name, offset: r.varint() })
      if (offsets.length) key.offsets = offsets
      drawOrder.push(key)
    }
    if (drawOrder.length) anim.drawOrder = drawOrder

    const eventKeys = []
    for (let i = 0, n = r.varint(); i < n; i++) {
      const time = r.float()
      const data = events[r.varint()]
      const key = { time, name: data.name, int: r.varint(false), float: r.float() }
      key.string = r.bool() ? r.string() : undefined
      if (data.audio !== null) {
        key.volume = r.float()
        key.balance = r.float()
      }
      eventKeys.push(compact(key, {}))
    }
    if (eventKeys.length) anim.events = eventKeys

    return anim
  }
}

if (import.meta.main) {
  const [input, output = input.replace(/\.skel(\.bytes)?$/, '') + '.json'] = process.argv.slice(2)
  if (!input) {
    console.error('Usage: bun scripts/spine38_to_json.mjs <skeleton.skel> [out.json]')
    process.exit(1)
  }
  const json = convert(new Uint8Array(readFileSync(input)))
  writeFileSync(output, JSON.stringify(json))
  const a = json.animations
  console.log(`Wrote ${output}: ${json.bones.length} bones, ${json.slots.length} slots, ${json.skins.length} skins, ${Object.keys(a).length} animations.`)
}
