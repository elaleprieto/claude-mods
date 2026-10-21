/** One rate-limit window, as `session.measure` reports it. */
export type Limit = { kind: string; percentUsed: number; resetsAt?: string }

declare module 'claude-code' {
  interface PluginState {
    'sub-meter': {
      /** The last reading of the windows the meter shows. */
      limits: Limit[]
      /** Which of those windows is on screen, counted up by the rotation. */
      turn: number
    }
  }
}
