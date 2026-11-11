# Features

Plana is a Discord bot with a web dashboard for running one server.

## In Discord

### Triage for new members
- When a member gets the triage role, Plana posts a card for them in the announcement channel, with a greeting and a warning if their account is new.
- Buttons on the card assign the trusted or allowed role. Once someone is assigned, the card updates to show it's resolved.
- Giving one of those roles by hand in Discord counts the same as pressing the button: the triage role is taken, and the card shows who assigned it. Needs the View Audit Log permission.
- Members who stay in triage longer than a set number of days get named in a reminder post (once per stay).
- If a member leaves while still waiting in triage, their card is deleted.

### Birthdays
- `/birthday set`, `remove`, `show [member]` and `upcoming`. Only the month and day are stored.
- **Show birthday** in a member's Apps menu (right-click) does the same as `/birthday show` for them.
- **Set birthday** in a member's Apps menu (right-click) opens a form to set their birthday for them, prefilled with the saved date. Admins only by default; a server can open it to other roles under Server Settings → Integrations.
- Birthdays are announced in the birthday channel, using the configured time zone.
- An optional birthday role is given for the day and taken back afterwards.

### Leave messages
- When a member leaves, Plana posts a short note naming them (without a ping) in the leave channel, if one is set.

### Game nights
- When enough people (3 by default) play the same game together in a voice channel for a while, Plana announces a game night.
- The announcement has "I'm in" and "Can't make it" buttons, and its title depends on the time of day.
- Each game can have its own ping role, and posts show the game's icon as an emoji.
- A game night ends once nobody in its voice channel has been playing the game for 5 minutes: the buttons come off, and the post says when it ended, who came (everyone in its voice channel for a minute or more) and how many who said "I'm in" did.
- `/gamenight plan game time [day]` plans one ahead, up to 14 days, in the server's time zone. The post gets a "Cancel" button for whoever planned it and staff. 15 minutes before, Plana replies to it pinging the game's role and everyone who said "I'm in". Once it starts, it follows the voice channel where people gather to play it; if nobody has within an hour, it's closed. A member can have 3 planned at once.

### Reminders
- `/remind me in about` sets a reminder: `in` reads lengths like `2h`, `30m` or `1d 6h`, up to a year. `/remind list` shows yours, and `/remind cancel` takes one off.
- Reminders arrive by DM, or in the channel they were set in, with a ping, if DMs are closed. Up to 25 waiting per member.

### Weekly recap
- Posted every Sunday at 18:00 to the recap channel, covering the past 7 days: top games, music, voice time and new members.
- If the bot was down at that time, the recap still goes out once it's back, as long as that's soon enough.

### Broadcasts
- `/broadcast channel [message]` posts as the bot. Leave out the message to open a multi-line composer. Admins only by default; a server can open it to other roles under Server Settings → Integrations.

### Stats
- `/stats [member] [period]` shows a member's dashboard profile as plain text: when they joined, what they're doing right now, and their totals. The period defaults to the last 30 days; 7 days, 90 days and all time are also offered.
- **View stats** in a member's Apps menu (right-click) shows the same for them, over the last 30 days.
- Games, Music and Voice buttons switch the list underneath, showing up to 10 rows each.
- Only the person who ran it can see the reply.

### About
- `/about` shows Plana's version, language, host and creation date, with a link to the source on GitHub. Only the person who ran it can see the reply.

### Tracking
- Game playtime and Spotify listening, from member presence.
- What Vivy, the server's music bot, played and who asked for it, read from the Redis both bots share when `VIVY_STATS` is on. Read only; Plana never writes Vivy's data.
- Time in voice, per member and per channel. The AFK channel and time spent deafened don't count.
- Game icons are fetched from Discord or Steam and cached.

## Dashboard

Members sign in with Discord. **Administrators** can use everything. **Moderators** (the moderator role) can use everything except Settings and Broadcast. **Viewers** (the stats role) can see only the stats: Overview without its triage and audit sections, Games & music, and Voice. Pages update live over a WebSocket.

Hovering a role, channel or user mention (audit log entries, role chips, broadcast previews) opens a tooltip with a few numbers, fetched on first hover: for a user, when they joined and their voice, game and music activity over the last 30 days; for a role, how many members hold it; for a channel, its category and, for a voice channel, the last 30 days of time and top members. Mentions with no known ID (such as older audit entries) show no tooltip.

| Page | What it shows |
| --- | --- |
| **Overview** | Charts of daily hours in voice, played and listened over the last 4 weeks (each with the last 7 days against the 7 before), recent activity, who's waiting in triage, and this week's top games and their players |
| **Triage queue** | Members waiting in triage |
| **Broadcast** | Builder for Components V2 messages (sections, galleries, button rows) with a live preview, or pasted JSON |
| **Members** | Searchable member list. Each profile has facts, birthday, game nights they came to (and how often they came when they said yes), a 6-month strip of their days in voice or games, voice channels, games, tracks and audit history |
| **Birthdays** | Upcoming birthdays; add, edit or remove them |
| **Games & music** | Who's playing or listening right now, weekday-by-hour heatmaps of when people play and when they listen, most-played games, and most-played tracks; with Vivy connected, a Vivy plays tile, Vivy's most-played tracks and its top requesters (periods only reach back to when Vivy began counting by day) |
| **Game nights** | Opened from Games & music: every game night so far, planned, going on or ended, with who said they're in and who came; for administrators, every game played, each with the role its game nights ping |
| **Voice** | Who's in voice now, a weekday-by-hour heatmap of when people are in voice, members with the most voice time, and the busiest channels with each one's share of the time |
| **Audit log** | Searchable, filterable log covering joins and leaves, triage, moderation, deleted and edited messages, birthdays, broadcasts, settings and sign-ins |
| **Settings** | Roles and channels grouped by feature, triage reminder days, game night minimum players, backups, live server logs, and an About pane |

## Operations
- SQLite database with off-site backups to Cloudflare R2: scheduled, run on demand, zstd-compressed, with optional retention. Can also be run with `bun run backup`.
- Any listed backup can be restored from Settings. Plana checks it, backs up the current database first, then restarts on the backup (keeping everyone signed in). The replaced file is kept beside the database as `.pre-restore`. Needs a restart policy, which the Compose file sets.
- Optional Redis cache for dashboard queries.
- Logging through LogTape, with a live log viewer in Settings.
- Sign-ins are audited, and session IDs are stored hashed.
- Slash commands are registered on startup, or with `bun run commands:deploy`.
- CI runs format and type checks. A container image is published for each version tag.
