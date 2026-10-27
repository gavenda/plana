# Features

Plana is a Discord bot with a web dashboard for running one server.

## In Discord

### Triage for new members
- When a member gets the triage role, Plana posts a card for them in the announcement channel, with a greeting and a warning if their account is new.
- Buttons on the card assign the trusted or allowed role. Once someone is assigned, the card updates to show it's resolved.
- Members who stay in triage longer than a set number of days get named in a reminder post (once per stay).

### Birthdays
- `/birthday set`, `remove`, `show [member]` and `upcoming`. Only the month and day are stored.
- Birthdays are announced in the birthday channel, using the configured time zone.
- An optional birthday role is given for the day and taken back afterwards.

### Game nights
- When enough people (3 by default) play the same game together in a voice channel for a while, Plana announces a game night.
- The announcement has "I'm in" and "Can't make it" buttons, and its title depends on the time of day.
- Each game can have its own ping role, and posts show the game's icon as an emoji.

### Weekly recap
- Posted every Sunday at 18:00 to the recap channel, covering the past 7 days: top games, music, voice time and new members.
- If the bot was down at that time, the recap still goes out once it's back, as long as that's soon enough.

### Broadcasts
- `/broadcast channel [message]` posts as the bot. Leave out the message to open a multi-line composer. Admins only.

### Stats
- `/stats [member] [period]` shows a member's dashboard profile as plain text: roles, when they joined, what they're doing right now, and their totals. The period defaults to the last 30 days; 7 days, 90 days and all time are also offered.
- Games, Music and Voice buttons switch the list underneath, showing up to 10 rows each.
- Only the person who ran it can see the reply.

### Tracking
- Game playtime and Spotify listening, from member presence.
- Time in voice, per member and per channel. The AFK channel and time spent deafened don't count.
- Game icons are fetched from Discord or Steam and cached.

## Dashboard

Members sign in with Discord. **Administrators** can use everything. **Moderators** (the moderator role) can use everything except Settings and Broadcast. Pages update live over a WebSocket.

| Page | What it shows |
| --- | --- |
| **Overview** | Recent activity, who's waiting in triage, and this week's top games and their players |
| **Triage queue** | Members waiting in triage |
| **Broadcast** | Builder for Components V2 messages (sections, galleries, button rows) with a live preview, or pasted JSON |
| **Members** | Searchable member list. Each profile has facts, birthday, voice channels, games, tracks and audit history |
| **Birthdays** | Upcoming birthdays; add, edit or remove them |
| **Games & music** | Who's playing or listening right now, most-played games, most-played tracks, and per-game ping roles |
| **Voice** | Who's in voice now, members with the most voice time, and the busiest channels |
| **Audit log** | Searchable, filterable log covering triage, moderation, deleted and edited messages, birthdays, broadcasts, settings and sign-ins |
| **Settings** | Roles and channels grouped by feature, triage reminder days, game night minimum players, backups, live server logs, and an About pane |

## Operations
- SQLite database with off-site backups to Cloudflare R2: scheduled, run on demand, zstd-compressed, with optional retention. Can also be run with `bun run backup`.
- Optional Redis cache for dashboard queries.
- Logging through LogTape, with a live log viewer in Settings.
- Sign-ins are audited, and session IDs are stored hashed.
- Slash commands are registered on startup, or with `bun run commands:deploy`.
- CI runs format and type checks. A container image is published for each version tag.
