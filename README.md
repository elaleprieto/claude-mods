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

## Install

At the prompt of a Claude Code session:

```
/plugin install sub-meter --marketplace aleprieto/claude-mods
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
