# Server

## Slash commands, buttons and modals

- A slash command is one file, `src/server/commands/chat-input/<name>.command.ts`, exporting
  an `AppChatInputCommand` named `<name>Command`. It has a `name`, a `data()` that builds the
  `SlashCommandBuilder` and ends in `.toJSON()`, and an `execute(context, interaction)`.
  Add it to the list in `commands/chat-input/index.ts`; that list is both registered with
  Discord and used to route interactions by `name`.
- Commands in a member's Apps menu (right-click) work the same way, in
  `src/server/commands/user/` as `AppUserCommand`s built with `ContextMenuCommandBuilder`.
  They're routed by their display name, so `name()` reads the same locale key as `data()`.
  Both lists are registered together through `getCommandData()` in `commands/index.ts`.
- Its text goes under `command.<name>` in the locale file (description, option descriptions,
  choices). The text of its replies goes under a key of its own, such as `about.*` or
  `stats.*`.
- Limit who can use a command with `setDefaultMemberPermissions` (usually
  `Administrator`), and don't re-check in `execute` or in its modal: servers widen it
  under Integrations on purpose. Buttons on public messages do check, with `isStaff` or
  `isAdministrator`.
- Reply with the interaction's locale (`tl(…, interaction.locale)`). Make replies
  `MessageFlags.Ephemeral` unless the command exists to post publicly (`/broadcast`).
  `deferReply` first if the work could take more than 3 seconds.
- Don't use deprecated discord.js APIs; their typings mark them `@deprecated`. For example,
  modals take `LabelBuilder`s through `addLabelComponents`, not action rows through
  `addComponents`, and inputs get their label from the `LabelBuilder`, not `setLabel`.
- Rich replies use Components v2 (`MessageFlags.IsComponentsV2`) with top-level sections,
  text displays and separators, no container. See `about.command.ts` and `discord/stats.ts`.
- Buttons and modals live in `src/server/handlers/buttons` and `handlers/modals`, as
  `<name>.handler.ts` exporting an `AppButtonHandler` or `AppModalSubmitHandler`, listed in that
  folder's `index.ts`. They're routed by the `custom_id` prefix before the first `:`. Build
  and parse the `custom_id` with the `encode…`/`decode…` helpers in
  `src/server/discord/ids.ts`, since the ID is the only state Discord sends back.
- Add the command to [FEATURES.md](../../FEATURES.md). New commands reach Discord when the bot
  restarts or on `bun run commands:deploy`.
