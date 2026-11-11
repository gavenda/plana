/** What GET /api/mentions/:kind/:id returns; see src/server/discord/mentions.ts. */

import { reactive } from 'vue'

import { apiFetch } from './api'
import type { ActivityMember } from './activity'

export type MentionKind = 'user' | 'role' | 'channel'

export type MentionBrief =
  | {
      kind: 'user'
      member: ActivityMember
      /** False for someone who has left. */
      inServer: boolean
      joinedAt: number | null
      days: number
      voiceMs: number
      gameMs: number
      topGame: string | null
      plays: number
    }
  | { kind: 'role'; name: string; color: string; members: number }
  | {
      kind: 'channel'
      name: string
      category: string | null
      /** Null for a channel that isn't a voice channel, which tracks nothing. */
      voice: {
        days: number
        ms: number
        members: number
        top: { displayName: string; ms: number }[]
      } | null
    }

export type MentionEntry =
  | { status: 'loading' }
  | { status: 'error'; message: string; at: number }
  | { status: 'ready'; brief: MentionBrief; at: number }

/** How long a brief is reused before hovering fetches it again. */
const FRESH_MS = 60_000

const entries = reactive(new Map<string, MentionEntry>())

/** The brief for a mention as far as it is loaded; reactive, so a tooltip fills in as it lands. */
export function mentionEntry(kind: MentionKind, id: string): MentionEntry | undefined {
  return entries.get(`${kind}:${id}`)
}

/** Fetches a mention's brief unless a fresh answer, or one on its way, is already held. */
export async function loadMention(kind: MentionKind, id: string): Promise<void> {
  const key = `${kind}:${id}`
  const held = entries.get(key)
  if (held?.status === 'loading') return
  if (held && Date.now() - held.at < FRESH_MS) return

  // Keep showing the old numbers while they refresh.
  if (held?.status !== 'ready') entries.set(key, { status: 'loading' })
  try {
    const brief = await apiFetch<MentionBrief>(`/api/mentions/${kind}/${id}`)
    entries.set(key, { status: 'ready', brief, at: Date.now() })
  } catch (cause) {
    entries.set(key, {
      status: 'error',
      message: cause instanceof Error ? cause.message : 'Something went wrong.',
      at: Date.now(),
    })
  }
}
