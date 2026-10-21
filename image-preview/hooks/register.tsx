import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { MACOS } from './window'

const draft = atom({ plugin: 'image-preview', key: 'draft' } as const, [] as number[])
const stored = atom({ plugin: 'image-preview', key: 'stored' } as const, [] as number[])

const TOKEN = /\[Image #(\d+)\]/g
// Where the engine lists a sent prompt's images, `⎿ [Image #N]` a row, under the prompt.
const LISTED_AT = 5
// Where a sent prompt's text starts: past `❯ `, on the row after the blank one above it.
const PROMPT_AT = 2
// Text whose characters take one cell each.
const NARROW = /^[\u0020-\u02ff]*$/
// A paste puts the placeholder in the box without an edit event: the box is looked at this often.
const POLL_MS = 500

const idsIn = (text: string) => [...new Set([...text.matchAll(TOKEN)].map(match => Number(match[1])))]

const sameIds = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((id, i) => id === b[i])

/** Keeps the band's list of the draft's images in step with the prompt box. */
async function track($: EngineInterface, text: string) {
  const ids = idsIn(text)

  if (!sameIds(ids, await read($, draft))) {
    await update($, draft, () => ids)
  }
}

/**
 * Claude Code's temp folder for this session, where a pasted image is stored as `images/<N>.<ext>`:
 * `<CLAUDE_CODE_TMPDIR or /tmp>/claude-<uid>/<project path, dashed>/<session id>`.
 */
async function sessionFolder($: EngineInterface) {
  const base = ((await $.env.get('CLAUDE_CODE_TMPDIR')) || '/tmp').replace(/\/+$/, '')
  const root = `${base}/claude-${(await $.process.run(['id', '-u'])).stdout.trim()}`
  const id = await $.session.id()
  const names = new Set([await $.session.root(), await $.session.cwd()].map(path => path.replace(/[^a-zA-Z0-9]/g, '-')))

  for (const name of names) {
    if (await $.fs.exists(`${root}/${name}/${id}/images`)) {
      return `${root}/${name}/${id}`
    }
  }

  return undefined
}

async function fileOf($: EngineInterface, id: number) {
  const folder = await sessionFolder($)

  if (folder === undefined) {
    return undefined
  }

  const name = (await $.fs.list(`${folder}/images`)).find(entry => entry.name.startsWith(`${id}.`))?.name

  return name === undefined ? undefined : `${folder}/images/${name}`
}

/** Looks for image `id` in the session's temp folder, and notes it once found: the drawings that wait on it redraw. */
async function look($: EngineInterface, id: number) {
  if ((await fileOf($, id)) !== undefined) {
    await update($, stored, ids => (ids.includes(id) ? ids : [...ids, id]))
  }
}

/** Opens image `id` in Preview. */
async function openImage($: EngineInterface, id: number) {
  const file = await fileOf($, id)

  if (file !== undefined) {
    await $.process.run(['open', '-a', 'Preview', file])
  }
}

// Whether a window can be shown here, asked as the session starts.
let canShow = false

// The window on show: which image, and whether it is still wanted.
let window: { id: number; isOpen: boolean } | undefined

/**
 * Shows image `id` in a window of its own, by the pointer, till `closeWindow`. The program says `.`
 * ten times a second, so the loop wakes to see it was closed, and leaving the loop ends the program.
 */
async function openWindow($: EngineInterface, id: number) {
  if (window?.id === id) {
    return
  }

  closeWindow()
  const opening = { id, isOpen: true }
  window = opening
  const file = await fileOf($, id)

  if (file === undefined || !opening.isOpen) {
    return
  }

  for await (const _ of $.process.spawn({ argv: ['osascript', '-l', 'JavaScript', '-e', MACOS], env: { IMAGE_PREVIEW_FILE: file } })) {
    if (!opening.isOpen) {
      break
    }
  }
}

/** Ends the window on show; given `id`, only that image's: a leave can come after the next chip's enter. */
function closeWindow(id?: number) {
  if (window === undefined || (id !== undefined && window.id !== id)) {
    return
  }

  window.isOpen = false
  window = undefined
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)

    // The window is an AppKit panel, on the desktop the session runs on: off macOS, or over SSH, where
    // that is another machine's, the mod shows nothing.
    const isRemote = (await $.env.get('SSH_CONNECTION')) !== undefined || (await $.env.get('SSH_TTY')) !== undefined
    canShow = !isRemote && (await $.process.run(['uname', '-s'])).stdout.trim() === 'Darwin'

    if (!canShow) {
      return result
    }

    await track($, (await $.prompt.read()).text)

    // A look that fails (the module unloading under it) waits for the next.
    $.clock.every(POLL_MS, () => {
      void $.prompt
        .read()
        .then(box => track($, box.text))
        .catch(() => undefined)
    })

    return result
  })

  // Sending the prompt takes its chips away, and the window one opened.
  on('prompt.submit', async ($, e, next) => {
    const result = await next(e)

    if (e.origin.kind === 'composer') {
      closeWindow()
      await update($, draft, () => [])
    }

    return result
  })

  // A pointer target (a chip of the band, or one over a sent prompt's text or list) says when the
  // pointer comes onto it and when it leaves: its window opens and closes. Clicked, it opens the image in Preview.
  on('ui.message', async ($, e, next) => {
    const result = await next(e)
    const chip = /^(?:chip|sent|token):(\d+)$/.exec(e.element)

    if (chip === null) {
      return result
    }

    const data = e.data as { isOver?: unknown; isClicked?: unknown } | null

    // Clicked, the image opens in Preview, over which the window would stand.
    if (data?.isClicked === true) {
      closeWindow()
      void openImage($, Number(chip[1]))
    } else if (data?.isOver === true) {
      void openWindow($, Number(chip[1]))
    } else {
      closeWindow(Number(chip[1]))
    }

    return result
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    // Off fullscreen the terminal reports no pointer: nothing could be hovered.
    if (e.surface !== 'terminal' || e.viewport?.isFullscreen === false) {
      return next(e)
    }

    const ids = await read($, draft)

    if (ids.length === 0) {
      return next(e)
    }

    const { Box, Client, Text } = $.ui.resolve(e)

    return (
      <Box flexDirection="column">
        {await next(e)}
        <Box flexDirection="row" columnGap={1}>
          {ids.map(id => <Client key={`chip:${id}`} module="./chip.tsx" props={{ label: `[Image #${id}]` }} />)}
          <Text dimColor>hover to preview · click to open</Text>
        </Box>
      </Box>
    )
  })

  // Under a sent prompt the engine lists the images it stored, `⎿ [Image #N]` a row, in the order
  // pasted: each gets a pointer target over it, unpainted, so the engine's row shows as it was.
  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    const drawn = await next(e)

    if (!canShow || e.surface !== 'terminal' || e.viewport?.isFullscreen === false || e.props.origin.kind !== 'composer') {
      return drawn
    }

    const found = await read($, stored)
    const sentIds = idsIn(e.props.text)

    for (const id of sentIds) {
      if (!found.includes(id)) {
        void look($, id)
      }
    }

    const ids = sentIds.filter(id => found.includes(id)).sort((a, b) => a - b)

    if (ids.length === 0) {
      return drawn
    }

    const { Box, Client } = $.ui.resolve(e)
    // The first line's `[Image #N]` take the click too, which the rows the engine lists keep for itself:
    // where their place can be told, before the line wraps, after text one cell a character.
    const line = e.props.text.split('\n')[0]!
    const width = (e.viewport?.columns ?? 80) - 1
    const tokens = [...line.matchAll(TOKEN)].filter(
      (match, i, all) =>
        ids.includes(Number(match[1])) &&
        all.findIndex(other => other[1] === match[1]) === i &&
        NARROW.test(line.slice(0, match.index)) &&
        PROMPT_AT + match.index + match[0].length <= width,
    )

    return (
      <Box flexDirection="column">
        {drawn}
        {ids.map((id, i) => (
          <Box key={`listed-${id}`} position="absolute" bottom={-1 - i} left={LISTED_AT}>
            <Client key={`sent:${id}`} module="./chip.tsx" width={`[Image #${id}]`.length} height={1} />
          </Box>
        ))}
        {tokens.map(match => (
          <Box key={`token-${match[1]}`} position="absolute" top={1} left={PROMPT_AT + match.index}>
            <Client key={`token:${match[1]}`} module="./chip.tsx" width={match[0].length} height={1} />
          </Box>
        ))}
      </Box>
    )
  })
}
