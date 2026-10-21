import { expect, test } from 'claude-code/testing'

import { bar, colorFor, formatRemaining, percentAt, pickWindows, shapeFor } from './meter'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

test('formats the time to reset in its two largest units', () => {
  expect(formatRemaining(42 * MINUTE)).toBe('42m')
  expect(formatRemaining(20_000)).toBe('1m')
  expect(formatRemaining(3 * HOUR + 5 * MINUTE)).toBe('3h 5m')
  expect(formatRemaining(2 * DAY + 4 * HOUR + 30 * MINUTE)).toBe('2d 4h')
})

test('fills the bar in tenths', () => {
  expect(bar(0)).toBe('──────────')
  expect(bar(58)).toBe('━━━━━━────')
  expect(bar(100)).toBe('━━━━━━━━━━')
})

test('turns yellow from 75% and red from 90%', () => {
  expect(colorFor(74)).toBe('claude')
  expect(colorFor(75)).toBe('warning')
  expect(colorFor(89)).toBe('warning')
  expect(colorFor(90)).toBe('error')
})

test('reads a window past its reset as empty', () => {
  const limit = { kind: 'five_hour', percentUsed: 80, resetsAt: '2026-10-21T12:00:00Z' }

  expect(percentAt(limit, Date.parse('2026-10-21T11:59:00Z'))).toBe(80)
  expect(percentAt(limit, Date.parse('2026-10-21T12:00:00Z'))).toBe(0)
})

test('keeps the 5-hour and weekly windows, in that order', () => {
  const limits = [
    { kind: 'spend_limit', percentUsed: 10 },
    { kind: 'seven_day', percentUsed: 20 },
    { kind: 'five_hour', percentUsed: 30 },
  ]

  expect(pickWindows(limits).map(limit => limit.kind)).toEqual(['five_hour', 'seven_day'])
})

test('picks the shape by the terminal width', () => {
  expect(shapeFor(undefined)).toBe('full')
  expect(shapeFor(100)).toBe('full')
  expect(shapeFor(99)).toBe('noBar')
  expect(shapeFor(79)).toBe('percentOnly')
  expect(shapeFor(59)).toBe('hidden')
})
