import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, RenderElement } from 'claude-code'

const FOLDER = '/tmp/claude-501/-project-app/s-1'

// Stands for the engine beneath the plugin: the session (on macOS unless told), its temp folder with the stored
// images, its prompt box, the window's program, and what the engine draws.
const engine = (
  on: On,
  { draft = '', files = ['1.png'], system = 'Darwin', env = {} }: { draft?: string; files?: string[]; system?: string; env?: Record<string, string> } = {},
) => {
  const clock = mock.clock(on, { now: 0 })
  mock.env(on, env)
  const box = { text: draft }
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.id', () => ({ value: 's-1' }))
  on('session.root', () => ({ value: '/project/app' }))
  on('session.cwd', () => ({ value: '/project/app' }))
  on('fs.exists', (_, e) => ({ value: e.path === `${FOLDER}/images` }))
  on('fs.list', (_, e) => ({
    value: e.path === `${FOLDER}/images` ? files.map(name => ({ name, kind: 'file' as const, size: 2048, mtimeMs: 0, isLink: false })) : [],
  }))
  on('prompt.read', () => ({ value: { text: box.text, cursor: box.text.length } }))
  // Sending empties the box.
  on('prompt.submit', (_, e) => ((box.text = ''), { text: e.text }))
  const runs: string[][] = []
  on('process.run', (_, e) => (runs.push([...e.argv]), {
    value: { exitCode: 0, stdout: e.argv[0] === 'uname' ? `${system}\n` : e.argv[0] === 'id' ? '501\n' : '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
  }))
  // A window's program: it says `shown`, then `.` every tenth of a second till it is ended.
  const windows: { argv: string[]; env: Record<string, string>; isEnded: boolean }[] = []
  on('process.spawn', async function* (_, e) {
    const opened = { argv: [...e.argv], env: { ...e.env }, isEnded: false }
    windows.push(opened)

    try {
      yield { stream: 'stdout' as const, text: 'shown\n' }

      for (;;) {
        await clock.sleep(100)
        yield { stream: 'stdout' as const, text: '.\n' }
      }
    } finally {
      opened.isEnded = true
    }
  })
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)

    return <Box key="engine" />
  })

  return { clock, box, windows, runs }
}

const START = { cwd: '/project/app', surface: 'terminal', isInteractive: true } as const
const BAND = { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 80, scroll: { offset: 0, bodyRows: 20 }, view: {} }

// The pointer onto (or off) a chip.
const point = (ui: { pointer: (event: { type: 'enter' | 'leave'; x: number; y: number; in?: string }) => Promise<void> }, chip: string, type: 'enter' | 'leave' = 'enter') =>
  ui.pointer({ type, x: 0, y: 0, in: chip })

// A prompt sent from the box, as the transcript draws it.
const sent = ($: Engine, text: string) =>
  $.ui.mount({
    plugin: 'image-preview',
    surface: 'terminal',
    component: 'UserMessage',
    requestId: 'm-1',
    props: { text, origin: { kind: 'composer' }, isExpanded: false },
    viewport: { columns: 120, rows: 40, isFullscreen: true },
  })

type Drawn = RenderElement & { children?: Drawn[]; props?: { key?: string } }

/** The element keyed `key` in a drawn tree, props and all. */
function keyed(tree: RenderElement, key: string): Drawn | undefined {
  const node = tree as Drawn

  if (node.props?.key === key) {
    return node
  }

  for (const child of node.children ?? []) {
    const found = typeof child === 'object' ? keyed(child, key) : undefined

    if (found !== undefined) {
      return found
    }
  }

  return undefined
}

const band = ($: Engine, isFullscreen = true) =>
  $.ui.mount({
    plugin: 'image-preview',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: BAND,
    viewport: { columns: 120, rows: 40, isFullscreen },
  })

test('a pasted image gets a chip above the prompt', async ($, on) => {
  const { clock } = engine(on, { draft: 'what is wrong here? [Image #1]' })
  await $.session.start(START)
  await clock.settle()
  const ui = await band($)

  expect(await ui.find({ type: 'Text', text: '[Image #1]', in: 'chip:1' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'hover to preview · click to open' })).toBeDefined()
  await ui.unmount()
})

test('off fullscreen, with no pointer to hover, the band is left as the engine draws it', async ($, on) => {
  const { clock } = engine(on, { draft: '[Image #1]' })
  await $.session.start(START)
  await clock.settle()
  const ui = await band($, false)

  expect(await ui.drawn()).toMatchObject({ type: 'Box', props: { key: 'engine' } })
  await ui.unmount()
})

test('an image pasted while the session runs gets its chip within half a second', async ($, on) => {
  const { clock, box } = engine(on)
  await $.session.start(START)
  box.text = 'and now? [Image #1]'
  await clock.advance(500)
  const ui = await band($)

  expect(await ui.find({ type: 'Text', text: '[Image #1]', in: 'chip:1' })).toBeDefined()
  await ui.unmount()
})

test('the pointer on a chip opens the picture in a window by it', async ($, on) => {
  const { clock, windows } = engine(on, { draft: '[Image #1]' })
  await $.session.start(START)
  await clock.settle()
  const ui = await band($)

  await point(ui, 'chip:1')
  await clock.advance(100)

  expect(windows).toHaveLength(1)
  expect(windows[0]!.argv.slice(0, 4)).toEqual(['osascript', '-l', 'JavaScript', '-e'])
  expect(windows[0]!.env).toMatchObject({ IMAGE_PREVIEW_FILE: `${FOLDER}/images/1.png` })
  await ui.unmount()
})

test('the pointer leaving the chip ends its window', async ($, on) => {
  const { clock, windows } = engine(on, { draft: '[Image #1]' })
  await $.session.start(START)
  await clock.settle()
  const ui = await band($)

  await point(ui, 'chip:1')
  await clock.advance(100)
  await point(ui, 'chip:1', 'leave')
  await clock.advance(200)

  expect(windows[0]!.isEnded).toBe(true)
  await ui.unmount()
})

test('moving from one chip to the next ends the first window and opens the next, the leave coming late', async ($, on) => {
  const { clock, windows } = engine(on, { draft: '[Image #1] [Image #2]', files: ['1.png', '2.jpg'] })
  await $.session.start(START)
  await clock.settle()
  const ui = await band($)

  await point(ui, 'chip:1')
  await clock.advance(100)
  await point(ui, 'chip:2')
  await point(ui, 'chip:1', 'leave')
  await clock.advance(300)

  expect(windows.map(opened => [opened.env.IMAGE_PREVIEW_FILE, opened.isEnded])).toEqual([
    [`${FOLDER}/images/1.png`, true],
    [`${FOLDER}/images/2.jpg`, false],
  ])
  await ui.unmount()
})

test('an image the session never stored opens no window', async ($, on) => {
  const { clock, windows } = engine(on, { draft: '[Image #7]' })
  await $.session.start(START)
  await clock.settle()
  const ui = await band($)

  await point(ui, 'chip:7')
  await clock.advance(100)

  expect(windows).toHaveLength(0)
  await ui.unmount()
})

test('a click on a chip opens the image in Preview', async ($, on) => {
  const { clock, runs } = engine(on, { draft: '[Image #1]' })
  await $.session.start(START)
  await clock.settle()
  const ui = await band($)

  await ui.pointer({ type: 'down', x: 2, y: 0, button: 'left', in: 'chip:1' })
  await ui.pointer({ type: 'up', x: 2, y: 0, button: 'left', in: 'chip:1' })
  await clock.settle()

  expect(runs).toContainEqual(['open', '-a', 'Preview', `${FOLDER}/images/1.png`])
  await ui.unmount()
})

test('the button let go off the chip it went down on opens nothing', async ($, on) => {
  const { clock, runs } = engine(on, { draft: '[Image #1]' })
  await $.session.start(START)
  await clock.settle()
  const ui = await band($)

  await ui.resize({ columns: 10, rows: 1, in: 'chip:1' })
  await ui.pointer({ type: 'down', x: 2, y: 0, button: 'left', in: 'chip:1' })
  await ui.pointer({ type: 'up', x: 30, y: 4, button: 'left', in: 'chip:1' })
  await clock.settle()

  expect(runs.filter(argv => argv[0] === 'open')).toEqual([])
  await ui.unmount()
})

test('under a sent prompt, each image the engine lists gets a pointer target over its row, unpainted', async ($, on) => {
  const { clock, windows } = engine(on, { files: ['1.png', '2.jpg'] })
  await $.session.start(START)
  const message = await sent($, 'compare [Image #2] with [Image #1]')
  await clock.settle()

  expect(await message.find({ key: 'engine' })).toBeDefined()
  expect(keyed(await message.drawn(), 'listed-1')).toMatchObject({ props: { position: 'absolute', bottom: -1, left: 5 } })
  expect(keyed(await message.drawn(), 'listed-2')).toMatchObject({ props: { position: 'absolute', bottom: -2, left: 5 } })
  expect(await message.find({ key: 'sent:2' })).toMatchObject({ type: 'Client', props: { width: 10, height: 1 } })
  expect(await message.find({ type: 'Text', in: 'sent:2' })).toBeUndefined()

  await point(message, 'sent:2')
  await clock.advance(100)

  expect(windows.map(opened => opened.env.IMAGE_PREVIEW_FILE)).toEqual([`${FOLDER}/images/2.jpg`])
  await message.unmount()
})

test('a sent prompt whose image was never stored is drawn as the engine draws it', async ($, on) => {
  const { clock } = engine(on, { files: [] })
  await $.session.start(START)
  const message = await sent($, 'what about [Image #9]')
  await clock.settle()

  expect(await message.drawn()).toMatchObject({ type: 'Box', props: { key: 'engine' } })
  await message.unmount()
})

test('a sent prompt\'s [Image #N] on its first line takes the pointer and the click', async ($, on) => {
  const { clock, windows, runs } = engine(on, { files: ['1.png', '2.png'] })
  await $.session.start(START)
  const message = await sent($, 'look at [Image #1] and [Image #2] [Image #1]\nthen [Image #9]')
  await clock.settle()

  expect(keyed(await message.drawn(), 'token-1')).toMatchObject({ props: { position: 'absolute', top: 1, left: 10 } })
  expect(keyed(await message.drawn(), 'token-2')).toMatchObject({ props: { position: 'absolute', top: 1, left: 25 } })
  expect(await message.findAll({ key: 'token:1' })).toHaveLength(1)

  await point(message, 'token:2')
  await clock.advance(100)
  expect(windows.map(opened => opened.env.IMAGE_PREVIEW_FILE)).toEqual([`${FOLDER}/images/2.png`])

  await message.pointer({ type: 'down', x: 3, y: 0, button: 'left', in: 'token:1' })
  await message.pointer({ type: 'up', x: 3, y: 0, button: 'left', in: 'token:1' })
  await clock.settle()
  expect(runs).toContainEqual(['open', '-a', 'Preview', `${FOLDER}/images/1.png`])
  await message.unmount()
})

test('an [Image #N] past where the first line could wrap gets no target there, only on its listed row', async ($, on) => {
  const { clock } = engine(on, { files: ['1.png'] })
  await $.session.start(START)
  const message = await sent($, `${'word '.repeat(30)}[Image #1]`)
  await clock.settle()

  expect(await message.find({ key: 'token:1' })).toBeUndefined()
  expect(await message.find({ key: 'sent:1' })).toBeDefined()
  await message.unmount()
})

test('an [Image #N] after wide characters, whose place cannot be told, gets no target there', async ($, on) => {
  const { clock } = engine(on, { files: ['1.png'] })
  await $.session.start(START)
  const message = await sent($, '¿qué es esto? 画像 [Image #1]')
  await clock.settle()

  expect(await message.find({ key: 'token:1' })).toBeUndefined()
  await message.unmount()
})

test('off macOS, with no window to open, the band is left as the engine draws it', async ($, on) => {
  const { clock } = engine(on, { draft: '[Image #1]', system: 'Linux' })
  await $.session.start(START)
  await clock.settle()
  const ui = await band($)

  expect(await ui.drawn()).toMatchObject({ type: 'Box', props: { key: 'engine' } })
  await ui.unmount()
})

test('over SSH the window would open on the other machine: the band and sent prompts are left as the engine draws them', async ($, on) => {
  const { clock, windows } = engine(on, { draft: '[Image #1]', env: { SSH_CONNECTION: '10.0.0.2 51000 10.0.0.1 22' } })
  await $.session.start(START)
  await clock.settle()
  const ui = await band($)
  const message = await sent($, 'look at [Image #1]')
  await clock.settle()

  expect(await ui.drawn()).toMatchObject({ type: 'Box', props: { key: 'engine' } })
  expect(await message.drawn()).toMatchObject({ type: 'Box', props: { key: 'engine' } })
  expect(windows).toHaveLength(0)
  await ui.unmount()
  await message.unmount()
})

test('sending the prompt takes the chips away, and the window a chip opened', async ($, on) => {
  const { clock, windows } = engine(on, { draft: '[Image #1]' })
  await $.session.start(START)
  await clock.settle()
  const ui = await band($)

  await point(ui, 'chip:1')
  await clock.advance(100)
  await $.prompt.submit({ text: '[Image #1]', wait: false, origin: { kind: 'composer' } })
  await clock.advance(200)

  expect(await ui.find({ key: 'chip:1' })).toBeUndefined()
  expect(windows[0]!.isEnded).toBe(true)
  await ui.unmount()
})
