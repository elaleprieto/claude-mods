import type { Limit } from '../types'

export const WINDOWS = ['five_hour', 'seven_day'] as const

const LABELS: Record<string, string> = { five_hour: '5h', seven_day: 'week' }

export const CELLS = 10

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** How much of the meter fits: everything, without the bar, the percentage alone, or nothing. */
export type Shape = 'full' | 'noBar' | 'percentOnly' | 'hidden'

/** The windows the meter shows, in the order they take turns. */
export const pickWindows = (limits: readonly Limit[]): Limit[] =>
  WINDOWS.flatMap(kind => limits.filter(limit => limit.kind === kind))

/** A window whose reset has passed is empty until the next reading says otherwise. */
export const percentAt = (limit: Limit, now: number): number => {
  if (limit.resetsAt !== undefined && Date.parse(limit.resetsAt) <= now) {
    return 0
  }

  return Math.min(100, Math.max(0, Math.round(limit.percentUsed)))
}

export const formatRemaining = (ms: number): string => {
  if (ms >= DAY) {
    return `${Math.floor(ms / DAY)}d ${Math.floor((ms % DAY) / HOUR)}h`
  }

  if (ms >= HOUR) {
    return `${Math.floor(ms / HOUR)}h ${Math.floor((ms % HOUR) / MINUTE)}m`
  }

  return `${Math.max(1, Math.floor(ms / MINUTE))}m`
}

export const bar = (percent: number): string => {
  const filled = Math.round((percent / 100) * CELLS)

  return '━'.repeat(filled) + '─'.repeat(CELLS - filled)
}

export const colorFor = (percent: number): 'error' | 'warning' | 'claude' =>
  percent >= 90 ? 'error' : percent >= 75 ? 'warning' : 'claude'

/** Narrower terminals drop the bar first, then the reset, then the meter. */
export const shapeFor = (columns: number | undefined): Shape => {
  if (columns === undefined || columns >= 100) {
    return 'full'
  }

  if (columns >= 80) {
    return 'noBar'
  }

  return columns >= 60 ? 'percentOnly' : 'hidden'
}

/** The meter's parts for one window; `bar` and `reset` are absent where the shape drops them. */
export const meterParts = (limit: Limit, now: number, shape: Exclude<Shape, 'hidden'>) => {
  const percent = percentAt(limit, now)
  const label = LABELS[limit.kind] ?? limit.kind
  const resetsAt = limit.resetsAt === undefined ? undefined : Date.parse(limit.resetsAt)
  const hasReset = shape !== 'percentOnly' && resetsAt !== undefined && resetsAt > now

  return {
    label,
    percent,
    color: colorFor(percent),
    ...(shape === 'full' ? { bar: bar(percent) } : {}),
    ...(hasReset ? { reset: `↻ ${formatRemaining(resetsAt - now)}` } : {}),
  }
}
