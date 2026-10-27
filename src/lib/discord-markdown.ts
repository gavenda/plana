/**
 * Discord's message markdown, parsed into a tree the dashboard draws with Vue rather than as
 * HTML, so nothing typed can become markup on the page. Follows what Discord itself renders:
 * headings (# to ###), subtext (-#), block quotes (> and >>>), bullet and numbered lists,
 * code blocks, and inline bold, italic, underline, strikethrough, spoilers, code and links,
 * with channel and role mentions, @everyone and @here, and custom emoji.
 *
 * User mentions (<@id>) stay as written, since the dashboard has no way to name an arbitrary
 * member.
 */

export type Inline =
  | string
  | { kind: 'bold' | 'italic' | 'underline' | 'strike' | 'spoiler'; children: Inline[] }
  | { kind: 'code'; text: string }
  | { kind: 'link'; url: string; children: Inline[] }
  | { kind: 'channel'; id: string }
  | { kind: 'role'; id: string }
  | { kind: 'everyone'; text: '@everyone' | '@here' }
  | { kind: 'emoji'; name: string; id: string; animated: boolean }

export type ListItem = { children: Inline[]; sublist?: ListBlock }
export type ListBlock = { kind: 'list'; ordered: boolean; start: number; items: ListItem[] }

export type Block =
  | { kind: 'paragraph'; children: Inline[] }
  | { kind: 'heading'; level: 1 | 2 | 3; children: Inline[] }
  | { kind: 'subtext'; children: Inline[] }
  | { kind: 'quote'; children: Block[] }
  | { kind: 'code'; lang: string; text: string }
  | ListBlock

// ------------------------------------------------------------------ inline ---

type Rule = {
  pattern: RegExp
  /** Only where the character before the match is not a word character. */
  wordStart?: boolean
  build: (match: RegExpExecArray) => Inline
}

const wrap =
  (kind: 'bold' | 'italic' | 'underline' | 'strike' | 'spoiler') =>
  (match: RegExpExecArray): Inline => ({ kind, children: parseInline(match[1]!) })

/** Tried in order at each position; the first to match wins. All sticky, so they match only there. */
const RULES: Rule[] = [
  { pattern: /\\([^\w\s])/y, build: (match) => match[1]! },
  { pattern: /(`+)([\s\S]*?[^`])\1(?!`)/y, build: (match) => ({ kind: 'code', text: match[2]! }) },
  {
    pattern: /\[([^[\]\n]+)\]\(<?(https?:\/\/[^\s<>()]+)>?\)/y,
    build: (match) => ({ kind: 'link', url: match[2]!, children: parseInline(match[1]!) }),
  },
  {
    pattern: /<?(https?:\/\/[^\s<>]*[^\s<>.,:;"')\]])>?/y,
    build: (match) => ({ kind: 'link', url: match[1]!, children: [match[1]!] }),
  },
  { pattern: /<#(\d+)>/y, build: (match) => ({ kind: 'channel', id: match[1]! }) },
  { pattern: /<@&(\d+)>/y, build: (match) => ({ kind: 'role', id: match[1]! }) },
  {
    pattern: /@(everyone|here)/y,
    build: (match) => ({ kind: 'everyone', text: match[0] as '@everyone' | '@here' }),
  },
  {
    pattern: /<(a?):(\w+):(\d+)>/y,
    build: (match) => ({
      kind: 'emoji',
      animated: match[1] === 'a',
      name: match[2]!,
      id: match[3]!,
    }),
  },
  { pattern: /\|\|([\s\S]+?)\|\|/y, build: wrap('spoiler') },
  { pattern: /\*\*([\s\S]+?)\*\*(?!\*)/y, build: wrap('bold') },
  { pattern: /__([\s\S]+?)__(?!_)/y, build: wrap('underline') },
  { pattern: /\*(?=\S)([\s\S]*?\S)\*(?!\*)/y, build: wrap('italic') },
  { pattern: /_([^_]+?)_(?!\w)/y, wordStart: true, build: wrap('italic') },
  { pattern: /~~([\s\S]+?)~~/y, build: wrap('strike') },
]

export function parseInline(text: string): Inline[] {
  const nodes: Inline[] = []
  let plain = ''
  let pos = 0

  outer: while (pos < text.length) {
    for (const rule of RULES) {
      if (rule.wordStart && pos > 0 && /\w/.test(text[pos - 1]!)) continue
      rule.pattern.lastIndex = pos
      const match = rule.pattern.exec(text)
      if (!match) continue

      const node = rule.build(match)
      if (typeof node === 'string') {
        plain += node
      } else {
        if (plain) nodes.push(plain)
        plain = ''
        nodes.push(node)
      }
      pos += match[0].length
      continue outer
    }
    plain += text[pos]
    pos += 1
  }

  if (plain) nodes.push(plain)
  return nodes
}

// ------------------------------------------------------------------- block ---

const FENCE = /```(?:([\w+#.-]+)\n)?\n?([\s\S]*?)\n?```/y
const HEADING = /^(#{1,3}) +(\S.*)$/
const SUBTEXT = /^-# +(\S.*)$/
const LIST_ITEM = /^( *)([-*]|\d{1,9}\.) +(\S.*)$/

type ListEntry = { indent: number; ordered: boolean; number: number; text: string }

function buildList(entries: ListEntry[]): ListBlock {
  const base = entries[0]!
  const items: ListItem[] = []
  let nested: ListEntry[] = []

  const closeNested = () => {
    const last = items[items.length - 1]
    if (last && nested.length) last.sublist = buildList(nested)
    nested = []
  }

  for (const entry of entries) {
    if (entry.indent > base.indent && items.length > 0) {
      nested.push(entry)
    } else {
      closeNested()
      items.push({ children: parseInline(entry.text) })
    }
  }
  closeNested()

  return { kind: 'list', ordered: base.ordered, start: base.number, items }
}

export function parseMarkdown(source: string, inQuote = false): Block[] {
  const blocks: Block[] = []
  const lines = source.split('\n')
  let paragraph: string[] = []

  const flush = () => {
    if (paragraph.length)
      blocks.push({ kind: 'paragraph', children: parseInline(paragraph.join('\n')) })
    paragraph = []
  }

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!

    // A fence can run over many lines, so it is matched against the rest of the message.
    if (line.startsWith('```')) {
      const rest = lines.slice(index).join('\n')
      FENCE.lastIndex = 0
      const match = FENCE.exec(rest)
      // On one line it is inline code, which the paragraph's inline rules draw.
      if (match?.[0].includes('\n')) {
        flush()
        blocks.push({ kind: 'code', lang: match[1] ?? '', text: match[2]! })
        const consumed = match[0].split('\n').length - 1
        const after = rest.slice(match[0].length).split('\n')[0] ?? ''
        if (after.trim()) {
          // Text after the closing fence, on its line, is read again as a line of its own.
          lines[index + consumed] = after
          index += consumed - 1
        } else {
          index += consumed
        }
        continue
      }
    }

    if (!inQuote && line.startsWith('>>> ')) {
      flush()
      const rest = [line.slice(4), ...lines.slice(index + 1)].join('\n')
      blocks.push({ kind: 'quote', children: parseMarkdown(rest, true) })
      break
    }

    if (!inQuote && (line.startsWith('> ') || line === '>')) {
      flush()
      const quoted: string[] = []
      while (index < lines.length && (lines[index]!.startsWith('> ') || lines[index] === '>')) {
        quoted.push(lines[index]!.slice(2))
        index++
      }
      index--
      blocks.push({ kind: 'quote', children: parseMarkdown(quoted.join('\n'), true) })
      continue
    }

    const heading = HEADING.exec(line)
    if (heading) {
      flush()
      blocks.push({
        kind: 'heading',
        level: heading[1]!.length as 1 | 2 | 3,
        children: parseInline(heading[2]!),
      })
      continue
    }

    const subtext = SUBTEXT.exec(line)
    if (subtext) {
      flush()
      blocks.push({ kind: 'subtext', children: parseInline(subtext[1]!) })
      continue
    }

    if (LIST_ITEM.test(line)) {
      flush()
      const entries: ListEntry[] = []
      let item: RegExpExecArray | null
      while (index < lines.length && (item = LIST_ITEM.exec(lines[index]!))) {
        const marker = item[2]!
        const first = entries[0]
        const ordered = marker.endsWith('.')
        // A switch between bullets and numbers at the list's own depth starts a new list.
        if (first && item[1]!.length <= first.indent && ordered !== first.ordered) break
        entries.push({
          indent: item[1]!.length,
          ordered,
          number: marker.endsWith('.') ? Number.parseInt(marker, 10) : 1,
          text: item[3]!,
        })
        index++
      }
      index--
      blocks.push(buildList(entries))
      continue
    }

    paragraph.push(line)
  }

  flush()
  return blocks
}
