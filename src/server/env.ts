import { z } from 'zod'

const snowflake = z.string().regex(/^\d{17,20}$/, 'must be a Discord snowflake ID')

/** An unset or blank variable reads as undefined, so `NAME=` in .env means "not set". */
const optionalString = z
  .string()
  .trim()
  .optional()
  .transform((value) => value || undefined)

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    HOST: z.string().default('0.0.0.0'),
    PORT: z.coerce.number().int().positive().default(3000),

    /** Public origin the dashboard is reached on. Must match the Discord OAuth redirect. */
    PUBLIC_BASE_URL: z.url().default('http://localhost:3000'),

    /**
     * How many reverse proxies sit in front of the app (a proxy, or a CDN and a proxy: 2). The
     * client's address is then read from X-Forwarded-For, counting that many entries in from the
     * end, since each proxy appends the address it saw and anything before them is the client's
     * say-so. Leave at 0 when reached directly, or the header is ignored. Only seeds the
     * dashboard's Settings the first time; after that it is changed there.
     */
    TRUSTED_PROXY_HOPS: z.coerce.number().int().min(0).default(0),

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

    /** IANA time zone the bot's day starts in, e.g. `Europe/Dublin`. Birthdays post at its midnight. */
    BIRTHDAY_TIMEZONE: z
      .string()
      .default('UTC')
      .refine((timeZone) => {
        try {
          new Intl.DateTimeFormat('en-US', { timeZone })
          return true
        } catch {
          return false
        }
      }, 'must be an IANA time zone such as Europe/Dublin'),

    /**
     * Off-site backups to a Cloudflare R2 bucket. All four or none: leave them blank to run
     * without backups.
     */
    R2_ACCOUNT_ID: optionalString,
    R2_ACCESS_KEY_ID: optionalString,
    R2_SECRET_ACCESS_KEY: optionalString,
    R2_BUCKET: optionalString,
    /** Only for a bucket created in a jurisdiction: `eu` or `fedramp`. Blank for the default. */
    R2_JURISDICTION: z.preprocess(
      (value) => (typeof value === 'string' ? value.trim().toLowerCase() || undefined : value),
      z.enum(['eu', 'fedramp']).optional(),
    ),
    BACKUP_INTERVAL_HOURS: z.coerce.number().positive().default(24),
    /**
     * Off by default: an R2 lifecycle rule expires old backups. Set a number of days to have the
     * bot delete older backups after each upload instead; the newest is always kept.
     */
    BACKUP_RETENTION_DAYS: z.preprocess((value) => {
      if (typeof value !== 'string') return value
      const text = value.trim().toLowerCase()
      if (text === '') return undefined
      return text === 'off' ? 0 : text
    }, z.coerce.number().nonnegative().default(0)),

    // Optional first-boot seeds for the settings the dashboard otherwise manages.
    TRIAGE_ROLE_ID: snowflake.optional(),
    UNIT_OWNER_ROLE_ID: snowflake.optional(),
    BOARDERS_ROLE_ID: snowflake.optional(),
    ANNOUNCE_CHANNEL_ID: snowflake.optional(),
    BIRTHDAY_CHANNEL_ID: snowflake.optional(),
    BIRTHDAY_ROLE_ID: snowflake.optional(),
    RECAP_CHANNEL_ID: snowflake.optional(),
    MODERATOR_ROLE_ID: snowflake.optional(),
  })
  .superRefine((value, ctx) => {
    const r2 = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET'] as const
    const set = r2.filter((key) => value[key])
    if (set.length === 0 || set.length === r2.length) return
    for (const key of r2) {
      if (!value[key]) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: 'needed with the other R2_* variables',
        })
      }
    }
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
