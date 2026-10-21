import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Limit } from '../types'
import { WINDOWS, meterParts, pickWindows, shapeFor } from './meter'

const limits = atom({ plugin: 'sub-meter', key: 'limits' } as const, [] as Limit[])
const turn = atom({ plugin: 'sub-meter', key: 'turn' } as const, 0)

// Only the windows the meter shows, so the store never keeps anything else.
const keep = (readings: readonly Limit[]): Limit[] =>
  readings
    .filter(limit => (WINDOWS as readonly string[]).includes(limit.kind))
    .map(({ kind, percentUsed, resetsAt }) => (resetsAt === undefined ? { kind, percentUsed } : { kind, percentUsed, resetsAt }))

async function save($: EngineInterface, readings: readonly Limit[]) {
  const kept = keep(readings)

  if (kept.length === 0) {
    return
  }

  await update($, limits, () => kept)
  await $.store.set('limits', kept)
}

export const register: Register = (on, options) => {
  const rotateMs = Math.max(1, Number(options.rotateSeconds ?? 8)) * 1000

  on('session.start', async ($, e, next) => {
    const result = await next(e)

    // The last session's reading shows until this one's first response.
    const stored = await $.store.get('limits')

    if (Array.isArray(stored)) {
      await update($, limits, () => keep(stored as Limit[]))
    }

    await save($, (await $.session.usage()).rateLimits)

    // Each tick shows the next window and redraws its countdown.
    $.clock.every(rotateMs, () => void update($, turn, n => n + 1))

    return result
  })

  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('rateLimits')) {
      await save($, e.rateLimits)
    }

    return next(e)
  })

  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    const drawn = await next(e)
    const windows = pickWindows(await read($, limits))
    const shape = shapeFor(e.viewport?.columns)

    if (windows.length === 0 || shape === 'hidden') {
      return drawn
    }

    const limit = windows[(await read($, turn)) % windows.length]!
    const meter = meterParts(limit, await $.clock.now(), shape)
    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box>
        <Text dimColor>{meter.label} </Text>
        {meter.bar === undefined ? null : <Text color={meter.color}>{meter.bar} </Text>}
        <Text color={meter.color}>{meter.percent}%</Text>
        {meter.reset === undefined ? null : <Text dimColor> {meter.reset}</Text>}
        {e.props.modes.length === 0 ? null : <Text>  </Text>}
        {drawn}
      </Box>
    )
  })
}
