# claude-mods

Mods for [Claude Code](https://claude.com/claude-code): plugins written against its function hooks API.

## sub-meter

Your subscription usage at the bottom right of the prompt footer. The 5-hour and the weekly windows take turns as a bar, with the time until each resets:

```
5h ━━━━━━──── 58% ↻ 2h 10m
```

- The bar turns yellow from 75% and red from 90%.
- On a narrow terminal it drops the bar first, then the reset time, then the whole meter.
- A new session shows the last reading it saw until its first response.
- With API-key billing there are no windows, so it shows nothing.
- `rotateSeconds` (in `/config`) sets how long each window stays on screen; the default is 8.

It reads only what Claude Code already reports (`session.measure` and `$.session.usage()`): no network calls, files or credentials.

Inspired by [Sub Meter](https://github.com/midudev/better-claude/tree/main/plugins/sub-meter) from midudev's better-claude.

## image-preview

Hover a pasted `[Image #N]` and the picture opens in a small window by the pointer. Click it to open it in Preview.

```
[Image #1] hover to preview · click to open        ← hover: the picture opens by the pointer
──────────────────────────────────────────────────
❯ what is wrong in this screenshot? [Image #1]
```

- **While you write**: a row above the prompt lists the draft's `[Image #N]`. The text inside the prompt box takes no pointer, so the row is the target.
- **After you send it**: the `⎿ [Image #N]` rows under the prompt you sent, and its `[Image #N]` in the first line, take the pointer; a click on the first line's opens Preview.
- The window is an AppKit panel run by `osascript`: it never takes the focus or the pointer, stands over every window, and stays two minutes at most.
- macOS only, and it needs the fullscreen interface (`"tui": "fullscreen"`), which reports the pointer. Off macOS or over SSH it shows nothing.

It reads the images Claude Code stores for the session in its temp folder (`<CLAUDE_CODE_TMPDIR or /tmp>/claude-<uid>/…/images`).

A trimmed take on [Image Preview](https://github.com/midudev/better-claude/tree/main/plugins/image-preview) from midudev's better-claude, whose window program it reuses (MIT).

## Install

At the prompt of a Claude Code session:

```
/plugin install sub-meter --marketplace aleprieto/claude-mods
/plugin install image-preview --marketplace aleprieto/claude-mods
```

Answer `y` to add the marketplace, then pick a scope.

## Development

Work from a local checkout: add it as a marketplace once, install from it, and Claude Code reads the mod from the folder itself.

```sh
claude plugin marketplace add ~/git/claude-mods
claude plugin install sub-meter@claude-mods
```

After an edit, run `/reload-plugins` in the session.

```sh
claude plugin validate sub-meter   # manifest and hooks module, as the engine reads them
claude plugin test sub-meter       # the *.test.ts(x) files under sub-meter/hooks
```

To type-check, load the mod once so Claude Code writes its types to `sub-meter/.claude-plugin/types/` (ignored by git), then run `tsc -p sub-meter`.

The hooks API is early access and may change between Claude Code releases.
