#!/usr/bin/env node
// Audits a JS/TS project against the coding-style baseline and prints one ok/FAIL/skip line per check.
// Usage: node audit.mjs [project-root]   (exit 1 when any check fails)
//
// Each check is one entry in CHECKS: { area, name, run, fix }. `run` returns true (ok), false or a
// string (FAIL, the string says what was found), or skip('reason') when the check does not apply.
// `fix` names the template in ./templates or the command that makes the check pass.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const root = resolve(process.argv[2] ?? '.');

const SKIP = Symbol('skip');
const skip = (reason) => ({ [SKIP]: reason });

function readText(relativePath) {
  const path = join(root, relativePath);

  return existsSync(path) ? readFileSync(path, 'utf8') : null;
}

// tsconfig and oxlint configs allow comments and trailing commas.
function parseJsonc(text) {
  let output = '';
  let inString = false;

  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    const next = text[index + 1];

    if (inString) {
      output += char;

      if (char === '\\') {
        output += next;
        index++;
      } else if (char === '"') {
        inString = false;
      }

      continue;
    }

    if (char === '"') {
      inString = true;
      output += char;
    } else if (char === '/' && next === '/') {
      while (index < text.length && text[index] !== '\n') {
        index++;
      }

      output += '\n';
    } else if (char === '/' && next === '*') {
      index = text.indexOf('*/', index + 2) + 1;
    } else {
      output += char;
    }
  }

  return JSON.parse(output.replace(/,(\s*[}\]])/g, '$1'));
}

function readJson(relativePath) {
  const text = readText(relativePath);

  if (text === null) {
    return null;
  }

  try {
    return parseJsonc(text);
  } catch {
    return null;
  }
}

function firstExisting(candidates) {
  return candidates.find((candidate) => existsSync(join(root, candidate))) ?? null;
}

// Root package.json plus every workspace package one level down (apps/*, packages/*, ...).
function workspacePackages() {
  const packages = [];

  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name === 'node_modules') {
      continue;
    }

    const direct = readJson(join(entry.name, 'package.json'));

    if (direct) {
      packages.push(direct);
    }

    for (const child of readdirSync(join(root, entry.name), { withFileTypes: true })) {
      const nested = child.isDirectory() ? readJson(join(entry.name, child.name, 'package.json')) : null;

      if (nested) {
        packages.push(nested);
      }
    }
  }

  return packages;
}

// compilerOptions after following relative `extends` (package extends are not resolved).
function tsCompilerOptions(relativePath, seen = new Set()) {
  const path = join(root, relativePath);

  if (seen.has(path)) {
    return {};
  }

  seen.add(path);
  const config = readJson(relativePath);

  if (!config) {
    return {};
  }

  const bases = [config.extends ?? []].flat().filter((base) => base.startsWith('.'));
  const inherited = bases.reduce(
    (options, base) => ({
      ...options,
      ...tsCompilerOptions(join(dirname(relativePath), base.endsWith('.json') ? base : `${base}.json`), seen),
    }),
    {}
  );

  return { ...inherited, ...config.compilerOptions };
}

function gitHooksDir() {
  const run = spawnSync('git', ['rev-parse', '--git-path', 'hooks'], { cwd: root, encoding: 'utf8' });

  return run.status === 0 ? resolve(root, run.stdout.trim()) : null;
}

const pkg = readJson('package.json') ?? {};
const scripts = pkg.scripts ?? {};
const rootDeps = { ...pkg.dependencies, ...pkg.devDependencies };
const allDeps = Object.assign({}, ...[pkg, ...workspacePackages()].map((p) => ({ ...p.dependencies, ...p.devDependencies })));
const usesReact = 'react' in allDeps;
const usesNext = 'next' in allDeps;

const prettierConfigFile = firstExisting(['.prettierrc.json', '.prettierrc', 'prettier.config.mjs', 'prettier.config.js']);
const prettierConfig = prettierConfigFile?.startsWith('.prettierrc') ? readJson(prettierConfigFile) : null;
const oxlintConfig = readJson('.oxlintrc.json');
const eslintConfig = readText('eslint.config.mjs');
const tsOptions = tsCompilerOptions('tsconfig.json');
const vitestConfigFile = firstExisting(['vitest.config.mts', 'vitest.config.ts', 'vitest.config.mjs', 'vitest.config.js']);
const lefthookConfig = readText('lefthook.yml');
const checkScript = readText('scripts/check.mjs');
const ciFiles = [
  'bitbucket-pipelines.yml',
  ...(existsSync(join(root, '.github/workflows'))
    ? readdirSync(join(root, '.github/workflows')).map((file) => `.github/workflows/${file}`)
    : []),
];
const ciText = ciFiles.map(readText).filter(Boolean).join('\n');
const agentsDoc = readText('AGENTS.md');
const usesPlaywright = '@playwright/test' in allDeps;
const playwrightConfig = readText(firstExisting(['playwright.config.ts', 'playwright.config.mts', 'playwright.config.js']) ?? '') ?? '';
const playwrightTestDir = /testDir:\s*['"]([^'"]+)['"]/.exec(playwrightConfig)?.[1] ?? 'tests';

// Every *.spec.* file under a directory, recursively.
function specFiles(relativeDir) {
  const dir = join(root, relativeDir);

  if (!existsSync(dir)) {
    return [];
  }

  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && /\.spec\.[cm]?[jt]sx?$/.test(entry.name))
    .map((entry) => join(entry.parentPath, entry.name));
}

const devDep = (name) => () => name in rootDeps || `${name} missing from the root package.json`;
const tsOption = (option) => () => tsOptions[option] === true || `${option} is ${tsOptions[option]}`;
const prettierOption = (option, expected) => () => {
  if (!prettierConfig) {
    return 'no .prettierrc.json';
  }

  return prettierConfig[option] === expected || `${option} is ${JSON.stringify(prettierConfig[option])}`;
};

const CHECKS = [
  // pnpm
  { area: 'pnpm', name: 'packageManager is pnpm', run: () => /^pnpm@/.test(pkg.packageManager ?? '') || `packageManager is ${pkg.packageManager}`, fix: 'corepack use pnpm@latest' },
  { area: 'pnpm', name: 'pnpm-lock.yaml committed', run: () => existsSync(join(root, 'pnpm-lock.yaml')), fix: 'pnpm install' },
  { area: 'pnpm', name: 'no npm/yarn/bun lockfile', run: () => !firstExisting(['package-lock.json', 'yarn.lock', 'bun.lockb', 'bun.lock']) || `found ${firstExisting(['package-lock.json', 'yarn.lock', 'bun.lockb', 'bun.lock'])}`, fix: 'delete it after pnpm import / pnpm install' },

  // Prettier
  { area: 'prettier', name: 'prettier devDependency', run: devDep('prettier'), fix: 'pnpm add -D prettier' },
  { area: 'prettier', name: '.prettierrc.json', run: () => prettierConfig !== null || (prettierConfigFile ? `${prettierConfigFile} is not JSON` : 'missing'), fix: 'templates/.prettierrc.json' },
  { area: 'prettier', name: 'semi: true', run: prettierOption('semi', true), fix: 'templates/.prettierrc.json' },
  { area: 'prettier', name: 'singleQuote: true', run: prettierOption('singleQuote', true), fix: 'templates/.prettierrc.json' },
  { area: 'prettier', name: 'printWidth: 120', run: prettierOption('printWidth', 120), fix: 'templates/.prettierrc.json' },
  { area: 'prettier', name: "trailingComma: 'es5'", run: prettierOption('trailingComma', 'es5'), fix: 'templates/.prettierrc.json' },
  { area: 'prettier', name: '.prettierignore covers the lockfile and build output', run: () => /pnpm-lock\.yaml/.test(readText('.prettierignore') ?? '') || 'missing or without pnpm-lock.yaml', fix: 'templates/.prettierignore' },
  { area: 'prettier', name: 'scripts.format / format:check', run: () => /prettier --write/.test(scripts.format ?? '') && /prettier --check/.test(scripts['format:check'] ?? ''), fix: '"format": "prettier --write .", "format:check": "prettier --check ."' },

  // oxlint
  { area: 'oxlint', name: 'oxlint devDependency', run: devDep('oxlint'), fix: 'pnpm add -D oxlint' },
  { area: 'oxlint', name: '.oxlintrc.json', run: () => oxlintConfig !== null || 'missing or invalid', fix: 'templates/.oxlintrc.json' },
  { area: 'oxlint', name: 'correctness category is error', run: () => oxlintConfig?.categories?.correctness === 'error', fix: 'templates/.oxlintrc.json' },
  { area: 'oxlint', name: "curly: ['error', 'all']", run: () => JSON.stringify(oxlintConfig?.rules?.curly) === '["error","all"]', fix: 'templates/.oxlintrc.json' },
  {
    area: 'oxlint',
    name: 'plugins match the stack',
    run: () => {
      const expected = ['typescript', 'unicorn', 'oxc', 'import', ...(usesReact ? ['react', 'jsx-a11y'] : []), ...(usesNext ? ['nextjs'] : [])];
      const missing = expected.filter((plugin) => !(oxlintConfig?.plugins ?? []).includes(plugin));

      return missing.length === 0 || `missing ${missing.join(', ')}`;
    },
    fix: 'templates/.oxlintrc.json (react/jsx-a11y only with React, nextjs only with Next)',
  },

  // ESLint (only what oxlint can't do)
  { area: 'eslint', name: 'eslint devDependency', run: devDep('eslint'), fix: 'pnpm add -D eslint typescript-eslint eslint-plugin-oxlint' },
  { area: 'eslint', name: 'typescript-eslint devDependency', run: devDep('typescript-eslint'), fix: 'pnpm add -D typescript-eslint' },
  { area: 'eslint', name: 'eslint-plugin-oxlint devDependency', run: devDep('eslint-plugin-oxlint'), fix: 'pnpm add -D eslint-plugin-oxlint' },
  { area: 'eslint', name: 'eslint.config.mjs', run: () => eslintConfig !== null || 'missing', fix: 'templates/eslint.config.mjs' },
  { area: 'eslint', name: 'padding-line-between-statements', run: () => /padding-line-between-statements/.test(eslintConfig ?? ''), fix: 'templates/eslint.config.mjs' },
  { area: 'eslint', name: 'reportUnusedDisableDirectives off', run: () => /reportUnusedDisableDirectives:\s*'off'/.test(eslintConfig ?? ''), fix: 'templates/eslint.config.mjs' },
  { area: 'eslint', name: 'buildFromOxlintConfigFile is the last entry', run: () => /\.\.\.oxlint\.buildFromOxlintConfigFile\([^)]*\),?\s*\);?\s*$/.test(eslintConfig ?? ''), fix: 'templates/eslint.config.mjs' },
  {
    area: 'eslint',
    name: 'Next core-web-vitals rules',
    run: () => (usesNext ? ('@next/eslint-plugin-next' in rootDeps && /core-web-vitals/.test(eslintConfig ?? '')) || 'missing plugin or rules' : skip('no next dependency')),
    fix: 'pnpm add -D @next/eslint-plugin-next; Next block in templates/eslint.config.mjs',
  },
  { area: 'eslint', name: "scripts.lint runs oxlint then eslint", run: () => /^oxlint\b.*&&\s*eslint\b/.test(scripts.lint ?? '') || `lint is ${JSON.stringify(scripts.lint)}`, fix: '"lint": "oxlint && eslint .", "lint:fix": "oxlint --fix && eslint . --fix"' },
  { area: 'eslint', name: 'scripts.lint:fix', run: () => /oxlint --fix/.test(scripts['lint:fix'] ?? ''), fix: '"lint:fix": "oxlint --fix && eslint . --fix"' },

  // TypeScript
  { area: 'typescript', name: 'typescript devDependency', run: devDep('typescript'), fix: 'pnpm add -D typescript' },
  { area: 'typescript', name: 'tsconfig.json', run: () => existsSync(join(root, 'tsconfig.json')), fix: 'templates/tsconfig.json' },
  ...['strict', 'noUncheckedIndexedAccess', 'noImplicitOverride', 'exactOptionalPropertyTypes', 'verbatimModuleSyntax', 'isolatedModules', 'forceConsistentCasingInFileNames', 'skipLibCheck'].map((option) => ({
    area: 'typescript',
    name: option,
    run: tsOption(option),
    fix: 'templates/tsconfig.json',
  })),
  { area: 'typescript', name: 'scripts.type-check', run: () => Boolean(scripts['type-check']), fix: '"type-check": "tsc --noEmit" (turbo run type-check in a monorepo)' },

  // Vitest
  { area: 'vitest', name: 'vitest devDependency', run: devDep('vitest'), fix: 'pnpm add -D vitest' },
  { area: 'vitest', name: 'vitest config', run: () => vitestConfigFile !== null || 'missing', fix: 'templates/vitest.config.mts' },
  { area: 'vitest', name: "scripts.test is 'vitest run'", run: () => /\bvitest run\b/.test(scripts.test ?? '') || `test is ${JSON.stringify(scripts.test)}`, fix: '"test": "vitest run", "test:watch": "vitest"' },

  // Lefthook
  { area: 'lefthook', name: 'lefthook devDependency', run: devDep('lefthook'), fix: 'pnpm add -D lefthook' },
  { area: 'lefthook', name: 'lefthook.yml', run: () => lefthookConfig !== null || 'missing', fix: 'templates/lefthook.yml' },
  { area: 'lefthook', name: 'pre-commit: prettier --write with stage_fixed', run: () => /prettier --write/.test(lefthookConfig ?? '') && /stage_fixed:\s*true/.test(lefthookConfig ?? ''), fix: 'templates/lefthook.yml' },
  { area: 'lefthook', name: 'pre-commit: oxlint and eslint on staged files', run: () => /oxlint \{staged_files\}/.test(lefthookConfig ?? '') && /eslint .*\{staged_files\}/.test(lefthookConfig ?? ''), fix: 'templates/lefthook.yml' },
  {
    area: 'lefthook',
    name: 'git pre-commit hook installed',
    run: () => {
      const hooksDir = gitHooksDir();

      if (!hooksDir) {
        return skip('not a git repository');
      }

      return /lefthook/.test(existsSync(join(hooksDir, 'pre-commit')) ? readFileSync(join(hooksDir, 'pre-commit'), 'utf8') : '') || 'no lefthook pre-commit hook';
    },
    fix: 'pnpm exec lefthook install (pnpm >= 10 blocks its postinstall: approve it with pnpm approve-builds)',
  },

  // pnpm check
  { area: 'check', name: "scripts.check is 'node scripts/check.mjs'", run: () => scripts.check === 'node scripts/check.mjs' && checkScript !== null, fix: 'templates/scripts/check.mjs + "check": "node scripts/check.mjs"' },
  { area: 'check', name: 'check.mjs runs lint, format:check, type-check, test', run: () => ['lint', 'format:check', 'type-check', 'test'].every((name) => (checkScript ?? '').includes(`'${name}'`)), fix: 'templates/scripts/check.mjs' },

  // CI
  { area: 'ci', name: 'CI pipeline exists', run: () => ciText.length > 0 || 'no bitbucket-pipelines.yml or .github/workflows', fix: 'templates/bitbucket-pipelines.yml or templates/.github/workflows/checks.yml' },
  {
    area: 'ci',
    name: 'CI runs the four checks',
    run: () => {
      const missing = ['pnpm lint', 'pnpm format:check', 'pnpm type-check', 'pnpm test'].filter((command) => !new RegExp(`${command}\\s*$`, 'm').test(ciText));

      return missing.length === 0 || `missing ${missing.join(', ')}`;
    },
    fix: 'same steps as the template',
  },
  { area: 'ci', name: 'CI installs with --frozen-lockfile', run: () => /--frozen-lockfile/.test(ciText), fix: 'LEFTHOOK=0 pnpm install --frozen-lockfile' },

  // Accessibility (axe runs in the Playwright e2e; jsx-a11y is under oxlint)
  {
    area: 'a11y',
    name: '@axe-core/playwright devDependency',
    run: () => (usesPlaywright ? '@axe-core/playwright' in rootDeps || 'missing from the root package.json' : skip('no @playwright/test dependency')),
    fix: 'pnpm add -D @axe-core/playwright',
  },
  {
    area: 'a11y',
    name: 'an e2e spec runs axe',
    run: () => {
      if (!usesPlaywright) {
        return skip('no @playwright/test dependency');
      }

      const specs = specFiles(playwrightTestDir);

      return specs.some((spec) => /@axe-core\/playwright/.test(readFileSync(spec, 'utf8'))) || `no spec in ${playwrightTestDir}/ imports @axe-core/playwright`;
    },
    fix: 'templates/e2e/accessibility.spec.ts (one test per screen or UI state)',
  },

  // Agent docs
  { area: 'docs', name: 'AGENTS.md mentions pnpm check', run: () => /pnpm check/.test(agentsDoc ?? '') || (agentsDoc === null ? 'no AGENTS.md' : 'no mention'), fix: '"Before committing: `pnpm check` from the repo root."' },
  { area: 'docs', name: 'CLAUDE.md imports @AGENTS.md', run: () => /@AGENTS\.md/.test(readText('CLAUDE.md') ?? ''), fix: 'CLAUDE.md with the single line @AGENTS.md' },
  { area: 'docs', name: 'CODING_STANDARDS.md', run: () => existsSync(join(root, 'CODING_STANDARDS.md')), fix: 'templates/CODING_STANDARDS.md' },
];

const counts = { ok: 0, FAIL: 0, skip: 0 };
let currentArea = '';

for (const check of CHECKS) {
  let result;

  try {
    result = check.run();
  } catch (error) {
    result = `check crashed: ${error.message}`;
  }

  const status = result === true ? 'ok' : result?.[SKIP] ? 'skip' : 'FAIL';
  const detail = status === 'skip' ? result[SKIP] : typeof result === 'string' ? result : '';
  counts[status]++;

  if (check.area !== currentArea) {
    currentArea = check.area;
    console.log(`\n[${currentArea}]`);
  }

  console.log(`${status.padEnd(4)} ${check.name}${detail ? ` (${detail})` : ''}`);

  if (status === 'FAIL') {
    console.log(`     fix: ${check.fix}`);
  }
}

console.log(`\n${counts.ok} ok, ${counts.FAIL} FAIL, ${counts.skip} skip  (${root})`);
process.exit(counts.FAIL > 0 ? 1 : 0);
