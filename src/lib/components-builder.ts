import { toRaw } from 'vue'

import {
  ComponentKind,
  type ContainerChild,
  type LinkButton,
  type Thumbnail,
  type TopLevelComponent,
} from '@/lib/components-v2'

/** A part the builder can add, with how it is named and drawn in the add menu. */
export type BlockKind = {
  type: TopLevelComponent['type']
  label: string
  icon: string
  create: () => TopLevelComponent
}

export const newLinkButton = (): LinkButton => ({
  type: ComponentKind.Button,
  style: 5,
  label: '',
  url: '',
})

export const newThumbnail = (): Thumbnail => ({
  type: ComponentKind.Thumbnail,
  media: { url: '' },
  description: '',
})

export const BLOCK_KINDS: BlockKind[] = [
  {
    type: ComponentKind.TextDisplay,
    label: 'Text',
    icon: 'text_fields',
    create: () => ({ type: ComponentKind.TextDisplay, content: '' }),
  },
  {
    type: ComponentKind.Section,
    label: 'Section',
    icon: 'view_agenda',
    create: () => ({
      type: ComponentKind.Section,
      components: [{ type: ComponentKind.TextDisplay, content: '' }],
      accessory: newThumbnail(),
    }),
  },
  {
    type: ComponentKind.MediaGallery,
    label: 'Gallery',
    icon: 'photo_library',
    create: () => ({
      type: ComponentKind.MediaGallery,
      items: [{ media: { url: '' }, description: '' }],
    }),
  },
  {
    type: ComponentKind.Separator,
    label: 'Separator',
    icon: 'horizontal_rule',
    create: () => ({ type: ComponentKind.Separator, divider: true, spacing: 1 }),
  },
  {
    type: ComponentKind.ActionRow,
    label: 'Buttons',
    icon: 'smart_button',
    create: () => ({ type: ComponentKind.ActionRow, components: [newLinkButton()] }),
  },
  {
    type: ComponentKind.Container,
    label: 'Container',
    icon: 'web_asset',
    create: () => ({
      type: ComponentKind.Container,
      accent_color: null,
      components: [{ type: ComponentKind.TextDisplay, content: '' }],
    }),
  },
]

export function blockKind(type: number): BlockKind | undefined {
  return BLOCK_KINDS.find((kind) => kind.type === type)
}

/** What a container may hold: everything but another container. */
export const CHILD_KINDS = BLOCK_KINDS.filter((kind) => kind.type !== ComponentKind.Container)

export type AnyBlock = TopLevelComponent | ContainerChild

const keys = new WeakMap<object, number>()
let nextKey = 0

/** A stable key for a part, so moving one keeps its fields (and their focus) with it. */
export function blockKey(block: object): number {
  const raw = toRaw(block)
  let key = keys.get(raw)
  if (key == null) {
    key = nextKey++
    keys.set(raw, key)
  }
  return key
}

export function colorToHex(color: number | null | undefined): string {
  return `#${(color ?? 0x5865f2).toString(16).padStart(6, '0')}`
}

export function hexToColor(hex: string): number {
  return Number.parseInt(hex.replace('#', ''), 16)
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  value != null && typeof value === 'object' && !Array.isArray(value)

const hasMedia = (value: unknown) => isObject(value) && isObject(value.media)

/**
 * Whether a part has the outline its editor and preview rely on. Pasted JSON is only checked
 * for this much before it is loaded, so a part with, say, no `items` is left to the JSON tab
 * instead of breaking the builder.
 */
export function isEditable(block: AnyBlock): boolean {
  const value = block as unknown as Record<string, unknown>
  switch (block.type) {
    case ComponentKind.TextDisplay:
      return typeof value.content === 'string'
    case ComponentKind.Section:
      return (
        Array.isArray(value.components) &&
        value.components.every((item) => isObject(item) && typeof item.content === 'string') &&
        isObject(value.accessory) &&
        (value.accessory.type === ComponentKind.Button || hasMedia(value.accessory))
      )
    case ComponentKind.MediaGallery:
      return Array.isArray(value.items) && value.items.every(hasMedia)
    case ComponentKind.Separator:
      return true
    case ComponentKind.ActionRow:
      return Array.isArray(value.components) && value.components.every(isObject)
    case ComponentKind.Container:
      return (
        Array.isArray(value.components) &&
        value.components.every((item) => isObject(item) && isEditable(item as AnyBlock))
      )
    default:
      return false
  }
}
