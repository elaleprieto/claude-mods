// ESLint only covers what oxlint can't (see .oxlintrc.json). eslint-plugin-oxlint
// must stay last so it turns off every rule oxlint already enforces.
import nextPlugin from '@next/eslint-plugin-next';
import oxlint from 'eslint-plugin-oxlint';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['**/node_modules/**', '**/.next/**', '**/dist/**', '**/next-env.d.ts', '.claude/**'],
  },
  {
    // Disable directives are shared with oxlint, so ESLint can't tell which are unused.
    linterOptions: { reportUnusedDisableDirectives: 'off' },
  },
  {
    files: ['**/*.{ts,tsx,mts,cts}'],
    languageOptions: { parser: tseslint.parser },
    // Registered without rules so existing `@typescript-eslint/*` disable comments resolve.
    plugins: { '@typescript-eslint': tseslint.plugin },
  },
  {
    // Prettier keeps blank lines but never adds them, and oxlint has no padding rule.
    files: ['**/*.{js,mjs,cjs,ts,tsx,mts,cts}'],
    rules: {
      'padding-line-between-statements': [
        'error',
        { blankLine: 'always', prev: '*', next: 'return' },
        { blankLine: 'always', prev: '*', next: 'block-like' },
        { blankLine: 'always', prev: 'block-like', next: '*' },
        { blankLine: 'always', prev: ['const', 'let', 'var'], next: '*' },
        { blankLine: 'any', prev: ['const', 'let', 'var'], next: ['const', 'let', 'var'] },
      ],
    },
  },
  {
    // Next.js only: point `files` and `rootDir` at the Next apps.
    files: ['**/*.{ts,tsx}'],
    plugins: { '@next/next': nextPlugin },
    rules: nextPlugin.configs['core-web-vitals'].rules,
  },
  ...oxlint.buildFromOxlintConfigFile('./.oxlintrc.json')
);
