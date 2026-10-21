declare module 'claude-code' {
  interface PluginState {
    'image-preview': {
      /** The `[Image #N]` ids in the prompt box, in the order typed. */
      draft: number[]
      /** The ids of the images found stored in the session's temp folder: the ones the engine lists under a sent prompt. */
      stored: number[]
    }
  }
}
