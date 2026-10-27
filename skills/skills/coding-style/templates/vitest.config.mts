import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Path aliases (`@/`) from the importer's nearest tsconfig.
    tsconfigPaths: true,
  },
  test: {
    // Vitest silently skips files outside `include`: keep it matching where tests actually live.
    include: ['**/src/**/*.test.ts', '**/lib/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    environment: 'node',
  },
});
