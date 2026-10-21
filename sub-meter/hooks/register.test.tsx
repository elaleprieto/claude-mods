import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

const NOW = Date.parse('2026-10-21T12:00:00Z')
const MINUTE = 60_000
const HOUR = 60 * MINUTE
const at = (ms: number) => new Date(NOW + ms).toISOString()

const READING = [
  { kind: 'five_hour', percentUsed: 58, resetsAt: at(2 * HOUR + 10 * MINUTE) },
  { kind: 'seven_day', percentUsed: 91, resetsAt: at(52 * HOUR) },
]

type Reading = typeof READING

// Stands for the engine beneath the plugin: the session, its usage, the clock and the store.
const engine = (on: On, { usage = READING, stored }: { usage?: Reading | []; stored?: Reading } = {}) => {
  const clock = mock.clock(on, { now: NOW })
  mock.store(on, stored === undefined ? {} : { limits: stored })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.usage', () => ({ value: { startedAt: NOW, context: { window: 200_000 }, rateLimits: usage } }))
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('ui.render', { component: 'SessionMode' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>{e.props.modes.join(' & ')}</Text>
  })

  return clock
}

const footer = async ($: Engine, columns = 120, modes: string[] = []) => {
  const ui = await $.ui.mount({
    plugin: 'sub-meter',
    surface: 'terminal',
    component: 'SessionMode',
    props: { modes },
    viewport: { columns, rows: 40 },
  })
  const text = async () => (await ui.findAll({ type: 'Text' })).map(found => found.text).join('')

  return { ui, text }
}

const START = { cwd: '/', surface: 'terminal', isInteractive: true } as const

test('shows the 5-hour window first, with its bar and the time to reset', async ($, on) => {
  engine(on)
  await $.session.start(START)
  const { ui, text } = await footer($)

  expect(await text()).toBe('5h ━━━━━━──── 58% ↻ 2h 10m')
  await ui.unmount()
})

test('takes turns with the weekly window', async ($, on) => {
  const clock = engine(on)
  await $.session.start(START)
  const { ui, text } = await footer($)

  await clock.advance(8_000)
  expect(await text()).toBe('week ━━━━━━━━━─ 91% ↻ 2d 3h')

  await clock.advance(8_000)
  expect(await text()).toBe('5h ━━━━━━──── 58% ↻ 2h 9m')
  await ui.unmount()
})

test('rotates at the configured pace', { options: { rotateSeconds: 3 } }, async ($, on) => {
  const clock = engine(on)
  await $.session.start(START)
  const { ui, text } = await footer($)

  await clock.advance(3_000)
  expect(await text()).toMatch(/^week /)
  await ui.unmount()
})

test('keeps the engine\'s mode labels after the meter', async ($, on) => {
  engine(on)
  await $.session.start(START)
  const { ui, text } = await footer($, 120, ['focus'])

  expect(await text()).toBe('5h ━━━━━━──── 58% ↻ 2h 10m  focus')
  await ui.unmount()
})

test('drops the bar, then the reset, then the meter as the terminal narrows', async ($, on) => {
  engine(on)
  await $.session.start(START)

  for (const [columns, expected] of [
    [90, '5h 58% ↻ 2h 10m'],
    [70, '5h 58%'],
    [50, ''],
  ] as const) {
    const { ui, text } = await footer($, columns)
    expect(await text()).toBe(expected)
    await ui.unmount()
  }
})

test('shows nothing off a subscription', async ($, on) => {
  engine(on, { usage: [] })
  await $.session.start(START)
  const { ui, text } = await footer($)

  expect(await text()).toBe('')
  await ui.unmount()
})

test('shows the last session\'s reading before the first response', async ($, on) => {
  engine(on, { usage: [], stored: READING })
  await $.session.start(START)
  const { ui, text } = await footer($)

  expect(await text()).toBe('5h ━━━━━━──── 58% ↻ 2h 10m')
  await ui.unmount()
})

test('follows a new reading', async ($, on) => {
  engine(on)
  await $.session.start(START)
  const { ui, text } = await footer($)

  await $.session.measure({
    context: { window: 200_000 },
    rateLimits: [{ kind: 'five_hour', percentUsed: 76.4, resetsAt: at(HOUR) }],
    changed: ['rateLimits'],
  })

  expect(await text()).toBe('5h ━━━━━━━━── 76% ↻ 1h 0m')
  await ui.unmount()
})
