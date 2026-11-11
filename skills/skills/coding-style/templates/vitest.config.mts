import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Path aliases (`@/`) from the importer's nearest tsconfig.
    tsconfigPaths: true,
  },
  test: {
    // When suites need different runtimes, split them into `projects` named by file suffix:
    // `*.test.ts` (unit, Node), `*.browser.test.ts` (browser mode), `*.db.test.ts` (a real database, a fresh one per run).
    // Vitest silently skips files outside `include`: keep it matching where tests actually live.
    include: ['**/src/**/*.test.ts', '**/lib/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    environment: 'node',
  },
});
