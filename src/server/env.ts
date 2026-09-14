import { z } from 'zod'

const snowflake = z.string().regex(/^\d{17,20}$/, 'must be a Discord snowflake ID')

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().default(3000),

  /** Public origin the dashboard is reached on. Must match the Discord OAuth redirect. */
  PUBLIC_BASE_URL: z.url().default('http://localhost:3000'),

  DISCORD_TOKEN: z.string().min(1),
  DISCORD_CLIENT_ID: snowflake,
  DISCORD_CLIENT_SECRET: z.string().min(1),
  DISCORD_GUILD_ID: snowflake,

  /** Used to sign the session cookie. Rotating it invalidates every session. */
  SESSION_SECRET: z.string().min(32, 'must be at least 32 characters'),
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(7),

  DATABASE_PATH: z.string().default('./data/plana.db'),

  /**
   * Cache only, never a source of truth. Set to an empty string to run without it;
   * the bot then serves everything live.
   */
  REDIS_URL: z.string().default('redis://127.0.0.1:6379'),

  // Optional first-boot seeds for the settings the dashboard otherwise manages.
  TRIAGE_ROLE_ID: snowflake.optional(),
  UNIT_OWNER_ROLE_ID: snowflake.optional(),
  BOARDERS_ROLE_ID: snowflake.optional(),
  ANNOUNCE_CHANNEL_ID: snowflake.optional(),
})

export type Env = z.infer<typeof schema>

function load(): Env {
  const parsed = schema.safeParse(Bun.env)
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n')
    console.error(`Invalid environment configuration:\n${issues}\n\nSee .env.example.`)
    process.exit(1)
  }
  return parsed.data
}

export const env = load()
export const isProduction = env.NODE_ENV === 'production'
