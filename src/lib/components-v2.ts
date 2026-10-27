import { z } from 'zod'

/**
 * The Components V2 message parts Broadcast can post, in Discord's own JSON shape, so a layout
 * built here or pasted from another tool is the same thing. Shared by the dashboard (to check a
 * pasted layout as it is typed) and the server (which has the final say before sending).
 *
 * Only parts that work without the bot answering them: no select menus, and buttons are link
 * buttons only, since nothing would handle a click on any other kind. Files are left out too,
 * since Broadcast has no uploads.
 */

export const ComponentKind = {
  ActionRow: 1,
  Button: 2,
  Section: 9,
  TextDisplay: 10,
  Thumbnail: 11,
  MediaGallery: 12,
  Separator: 14,
  Container: 17,
} as const

/** Discord's limits on a Components V2 message. */
export const MAX_COMPONENTS = 40
export const MAX_TEXT_LENGTH = 4000

/** An optional text left empty in the builder is the same as one left out. */
const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .nullish()
    .transform((value) => value?.trim() || undefined)

const mediaUrl = z.url({ protocol: /^https?$/, error: 'Must be an http(s) URL.' })

const media = z.object({ url: mediaUrl })

const textDisplay = z.object({
  type: z.literal(ComponentKind.TextDisplay),
  id: z.number().int().optional(),
  content: z.string().trim().min(1, 'Text cannot be empty.').max(MAX_TEXT_LENGTH),
})

const thumbnail = z.object({
  type: z.literal(ComponentKind.Thumbnail),
  id: z.number().int().optional(),
  media,
  description: optionalText(1024),
  spoiler: z.boolean().optional(),
})

const emoji = z.object({
  id: z.string().regex(/^\d+$/).optional(),
  name: z.string().optional(),
  animated: z.boolean().optional(),
})

const linkButton = z
  .object({
    type: z.literal(ComponentKind.Button),
    id: z.number().int().optional(),
    style: z.literal(
      5,
      'Only link buttons (style 5) are supported, since nothing answers a click.',
    ),
    label: optionalText(80),
    url: z.url({ protocol: /^https?$/, error: 'A link button needs an http(s) URL.' }),
    emoji: emoji.optional(),
    disabled: z.boolean().optional(),
  })
  .refine((button) => Boolean(button.label || button.emoji), {
    message: 'A button needs a label or an emoji.',
  })

const actionRow = z.object({
  type: z.literal(ComponentKind.ActionRow),
  id: z.number().int().optional(),
  components: z.array(linkButton).min(1, 'A button row needs a button.').max(5),
})

const section = z.object({
  type: z.literal(ComponentKind.Section),
  id: z.number().int().optional(),
  components: z.array(textDisplay).min(1, 'A section needs some text.').max(3),
  accessory: z.union([thumbnail, linkButton]),
})

const mediaGallery = z.object({
  type: z.literal(ComponentKind.MediaGallery),
  id: z.number().int().optional(),
  items: z
    .array(
      z.object({
        media,
        description: optionalText(1024),
        spoiler: z.boolean().optional(),
      }),
    )
    .min(1, 'A gallery needs an image.')
    .max(10),
})

const separator = z.object({
  type: z.literal(ComponentKind.Separator),
  id: z.number().int().optional(),
  divider: z.boolean().optional(),
  spacing: z.union([z.literal(1), z.literal(2)]).optional(),
})

const child = z.discriminatedUnion(
  'type',
  [textDisplay, section, mediaGallery, separator, actionRow],
  {
    error:
      'Not a part a container can hold here: use text (10), section (9), gallery (12), separator (14) or buttons (1).',
  },
)

const container = z.object({
  type: z.literal(ComponentKind.Container),
  id: z.number().int().optional(),
  accent_color: z.number().int().min(0).max(0xffffff).nullish(),
  spoiler: z.boolean().optional(),
  components: z.array(child).min(1, 'A container needs something in it.'),
})

const topLevel = z.discriminatedUnion(
  'type',
  [textDisplay, section, mediaGallery, separator, actionRow, container],
  {
    error:
      'Not a supported part: use text (10), section (9), gallery (12), separator (14), buttons (1) or container (17).',
  },
)

export type TextDisplay = z.infer<typeof textDisplay>
export type Thumbnail = z.infer<typeof thumbnail>
export type LinkButton = z.infer<typeof linkButton>
export type ActionRow = z.infer<typeof actionRow>
export type Section = z.infer<typeof section>
export type MediaGallery = z.infer<typeof mediaGallery>
export type Separator = z.infer<typeof separator>
export type ContainerChild = z.infer<typeof child>
export type Container = z.infer<typeof container>
export type TopLevelComponent = z.infer<typeof topLevel>

/** Every part in the message, nested ones included, as Discord counts them towards its 40. */
export function countComponents(components: readonly unknown[]): number {
  let total = 0
  for (const component of components as Record<string, unknown>[]) {
    total += 1
    if (Array.isArray(component.components)) total += countComponents(component.components)
    if (component.accessory) total += 1
  }
  return total
}

/** All the text the message shows, in order. Discord caps its total at 4000 characters. */
export function messageText(components: readonly TopLevelComponent[]): string[] {
  const texts: string[] = []
  const walk = (items: readonly (TopLevelComponent | ContainerChild)[]) => {
    for (const item of items) {
      if (item.type === ComponentKind.TextDisplay) texts.push(item.content)
      else if (item.type === ComponentKind.Section) walk(item.components)
      else if (item.type === ComponentKind.Container) walk(item.components)
    }
  }
  walk(components)
  return texts
}

export const componentsSchema = z
  .array(topLevel)
  .min(1, 'Add at least one component.')
  .superRefine((components, ctx) => {
    const count = countComponents(components)
    if (count > MAX_COMPONENTS) {
      ctx.addIssue({
        code: 'custom',
        message: `Discord allows ${MAX_COMPONENTS} components in a message; this has ${count}.`,
      })
    }
    const length = messageText(components).reduce((sum, text) => sum + text.length, 0)
    if (length > MAX_TEXT_LENGTH) {
      ctx.addIssue({
        code: 'custom',
        message: `Discord allows ${MAX_TEXT_LENGTH} characters of text in a message; this has ${length}.`,
      })
    }
  })

/** A zod issue as one line, led by where it is, such as `[0].components[2].content`. */
export function describeIssue(issue: z.core.$ZodIssue): string {
  const where = issue.path
    .map((part) => (typeof part === 'number' ? `[${part}]` : `.${String(part)}`))
    .join('')
    .replace(/^\./, '')
  return where ? `${where}: ${issue.message}` : issue.message
}

export function validateComponents(
  value: unknown,
): { ok: true; components: TopLevelComponent[] } | { ok: false; error: string } {
  const result = componentsSchema.safeParse(value)
  if (result.success) return { ok: true, components: result.data }
  return { ok: false, error: describeIssue(result.error.issues[0]!) }
}

/**
 * Pasted JSON, read leniently: a bare component array, or a whole message payload with a
 * `components` field, as other builders export. Only the JSON and its outline are checked
 * here, so a layout still being filled in can be loaded into the builder; the parts
 * themselves are checked by `validateComponents`.
 */
export function readComponentsJson(
  text: string,
): { ok: true; components: TopLevelComponent[] } | { ok: false; error: string } {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch (cause) {
    return { ok: false, error: `Not valid JSON: ${(cause as Error).message}` }
  }
  if (value && typeof value === 'object' && !Array.isArray(value) && 'components' in value) {
    value = (value as { components: unknown }).components
  }
  if (!Array.isArray(value)) {
    return { ok: false, error: 'Expected an array of components, or an object with `components`.' }
  }
  const index = value.findIndex(
    (item) =>
      !item || typeof item !== 'object' || typeof (item as { type?: unknown }).type !== 'number',
  )
  if (index !== -1)
    return { ok: false, error: `[${index}]: Each component needs a numeric \`type\`.` }
  return { ok: true, components: value as TopLevelComponent[] }
}
