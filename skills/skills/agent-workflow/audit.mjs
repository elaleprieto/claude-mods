#!/usr/bin/env node
// Audits a repo's agent workflow (implementer and reviewer agent types, worktrees, integration branch,
// check command) against the agent-workflow baseline and prints one ok/FAIL/skip line per check.
// Usage: node audit.mjs [repo-root]   (exit 1 when any check fails)
//
// Each check is one entry in CHECKS: { area, name, run, fix }. `run` returns true (ok), false or a
// string (FAIL, the string says what was found), or skip('reason') when the check does not apply.
// `fix` names the template in ./templates or the command that makes the check pass.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(process.argv[2] ?? '.');

const SKIP = Symbol('skip');
const skip = (reason) => ({ [SKIP]: reason });

function readText(relativePath) {
  const path = join(root, relativePath);

  return existsSync(path) ? readFileSync(path, 'utf8') : null;
}

function git(...args) {
  const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });

  return { ok: result.status === 0, out: (result.stdout ?? '').trim() };
}

// Flat `key: value` frontmatter, enough for agent definitions.
function frontmatter(text) {
  const block = /^---\n([\s\S]*?)\n---/.exec(text ?? '')?.[1];

  if (!block) {
    return null;
  }

  return Object.fromEntries(
    block
      .split('\n')
      .map((line) => /^([\w-]+):\s*(.*)$/.exec(line))
      .filter(Boolean)
      .map(([, key, value]) => [key, value.trim()])
  );
}

const implementerText = readText('.claude/agents/implementer.md');
const reviewerText = readText('.claude/agents/reviewer.md');
const implementer = frontmatter(implementerText);
const reviewer = frontmatter(reviewerText);

// CLAUDE.md often only imports AGENTS.md, so read both.
const instructions = ['CLAUDE.md', 'AGENTS.md'].map(readText).filter(Boolean).join('\n');
const gitWorkflow = readText('docs/agents/git-workflow.md');
const pkg = JSON.parse(readText('package.json') ?? '{}');

const checkCommand = existsSync(join(root, 'scripts/check.sh'))
  ? 'scripts/check.sh'
  : pkg.scripts?.check
    ? 'pnpm check'
    : null;

const prePushHooks = ['.githooks/pre-push', '.husky/pre-push', 'lefthook.yml'].map(readText).filter(Boolean).join('\n');
const isGitRepo = git('rev-parse', '--git-dir').ok;

const field = (agent, key, expected) => () =>
  agent === null ? 'agent file missing' : agent[key] === expected || `${key} is ${JSON.stringify(agent[key])}`;
const mentions = (text, pattern, missing) => () => (text === null ? missing : pattern.test(text) || 'no mention');

const CHECKS = [
  // Implementer agent type
  { area: 'implementer', name: '.claude/agents/implementer.md', run: () => implementer !== null || 'missing or without frontmatter', fix: 'templates/.claude/agents/implementer.md' },
  { area: 'implementer', name: 'model: sonnet', run: field(implementer, 'model', 'sonnet'), fix: 'frontmatter model: sonnet' },
  { area: 'implementer', name: 'effort: low', run: field(implementer, 'effort', 'low'), fix: 'frontmatter effort: low' },
  { area: 'implementer', name: 'resets its worktree onto the integration branch first', run: mentions(implementerText, /reset --hard|reset it to the integration branch/i, 'agent file missing'), fix: 'step 1 of templates/.claude/agents/implementer.md' },
  { area: 'implementer', name: 'builds test-first', run: mentions(implementerText, /\btdd\b|test-first|failing test/i, 'agent file missing'), fix: 'step 3 of templates/.claude/agents/implementer.md' },
  {
    area: 'implementer',
    name: "runs the repo's check command",
    run: () => (checkCommand === null ? skip('no check command, see [checks]') : mentions(implementerText, new RegExp(checkCommand.replace('.', '\\.')), 'agent file missing')()),
    fix: `name ${checkCommand ?? 'the check command'} in step 4 of templates/.claude/agents/implementer.md`,
  },
  { area: 'implementer', name: 'merges the integration branch tip before reporting', run: mentions(implementerText, /merge the integration branch/i, 'agent file missing'), fix: 'step 5 of templates/.claude/agents/implementer.md' },
  { area: 'implementer', name: 'pushes and closes nothing', run: mentions(implementerText, /push nothing|never push|don't push/i, 'agent file missing'), fix: 'step 5 of templates/.claude/agents/implementer.md' },

  // Reviewer agent type
  { area: 'reviewer', name: '.claude/agents/reviewer.md', run: () => reviewer !== null || 'missing or without frontmatter', fix: 'templates/.claude/agents/reviewer.md' },
  { area: 'reviewer', name: 'model: opus', run: field(reviewer, 'model', 'opus'), fix: 'frontmatter model: opus' },
  { area: 'reviewer', name: 'effort: medium', run: field(reviewer, 'effort', 'medium'), fix: 'frontmatter effort: medium' },
  {
    area: 'reviewer',
    name: 'read-only tools',
    run: () => {
      if (reviewer === null) {
        return 'agent file missing';
      }

      if (!reviewer.tools) {
        return 'no tools list, so it inherits Edit and Write';
      }

      const writers = ['Edit', 'Write', 'NotebookEdit'].filter((tool) => new RegExp(`\\b${tool}\\b`).test(reviewer.tools));

      return writers.length === 0 || `allows ${writers.join(', ')}`;
    },
    fix: 'tools: Read, Grep, Glob, Bash',
  },

  // Agent definitions are shared through git
  {
    area: 'git',
    name: '.claude/agents/ is committed, .claude/worktrees/ is ignored',
    run: () => {
      if (!isGitRepo) {
        return skip('not a git repo');
      }

      const agentsIgnored = git('check-ignore', '-q', '.claude/agents/implementer.md').ok;
      const worktreesIgnored = git('check-ignore', '-q', '.claude/worktrees/x').ok;
      const problems = [agentsIgnored && 'agents ignored', !worktreesIgnored && 'worktrees not ignored'].filter(Boolean);

      return problems.length === 0 || problems.join(', ');
    },
    fix: '.gitignore: /.claude/* and !/.claude/agents/',
  },
  {
    area: 'git',
    name: 'no prunable worktrees',
    run: () => {
      if (!isGitRepo) {
        return skip('not a git repo');
      }

      const prunable = git('worktree', 'list', '--porcelain').out.split('\n\n').filter((entry) => /^prunable/m.test(entry));

      return prunable.length === 0 || `${prunable.length} prunable`;
    },
    fix: 'git worktree prune (after checking nothing in them is needed)',
  },

  // CLAUDE.md / AGENTS.md wiring
  { area: 'instructions', name: 'names the implementer agent type with isolation "worktree"', run: mentions(instructions || null, /implementer[\s\S]{0,200}isolation: ?"worktree"/, 'no CLAUDE.md or AGENTS.md'), fix: 'templates/CLAUDE-subagents.md' },
  { area: 'instructions', name: 'names the reviewer agent type for /code-review', run: mentions(instructions || null, /reviewer[\s\S]{0,200}code-review|code-review[\s\S]{0,200}reviewer/, 'no CLAUDE.md or AGENTS.md'), fix: 'templates/CLAUDE-subagents.md' },
  { area: 'instructions', name: 'points to docs/agents/git-workflow.md', run: mentions(instructions || null, /docs\/agents\/git-workflow\.md/, 'no CLAUDE.md or AGENTS.md'), fix: 'templates/CLAUDE-subagents.md' },
  {
    area: 'instructions',
    name: 'names the check command',
    run: () => (checkCommand === null ? skip('no check command, see [checks]') : mentions(instructions || null, new RegExp(checkCommand.replace('.', '\\.')), 'no CLAUDE.md or AGENTS.md')()),
    fix: `"\`${checkCommand}\` must pass before anything merges to main."`,
  },

  // Git workflow doc
  { area: 'git-workflow', name: 'docs/agents/git-workflow.md', run: () => gitWorkflow !== null || 'missing', fix: 'templates/docs/agents/git-workflow.md' },
  { area: 'git-workflow', name: 'integration branch created without moving the main checkout', run: mentions(gitWorkflow, /git branch <[^>]+> main/, 'doc missing'), fix: 'Main checkout bullet in templates/docs/agents/git-workflow.md' },
  { area: 'git-workflow', name: 'worktree reset onto the integration branch', run: mentions(gitWorkflow, /reset --hard/, 'doc missing'), fix: 'Implementer worktrees bullet in templates/docs/agents/git-workflow.md' },
  { area: 'git-workflow', name: 'how a branch lands on main', run: mentions(gitWorkflow, /--no-ff|--ff-only|--squash/, 'doc missing'), fix: 'Into main bullet in templates/docs/agents/git-workflow.md' },
  { area: 'git-workflow', name: 'worktree removal without --force', run: mentions(gitWorkflow, /git worktree remove/, 'doc missing'), fix: 'Cleanup bullet in templates/docs/agents/git-workflow.md' },

  // Issue tracker (read by /implement-spec and /code-review)
  { area: 'tracker', name: 'docs/agents/issue-tracker.md', run: () => existsSync(join(root, 'docs/agents/issue-tracker.md')), fix: '/setup-matt-pocock-skills' },

  // Single check command and the hook that runs it
  { area: 'checks', name: 'one check command (scripts/check.sh or package.json check)', run: () => checkCommand !== null || 'none found', fix: 'scripts/check.sh, or /ale:coding-style for a JS/TS repo (pnpm check)' },
  {
    area: 'checks',
    name: 'scripts/check.sh is executable',
    run: () => (checkCommand !== 'scripts/check.sh' ? skip('no scripts/check.sh') : (statSync(join(root, 'scripts/check.sh')).mode & 0o111) !== 0 || 'not executable'),
    fix: 'chmod +x scripts/check.sh',
  },
  { area: 'checks', name: 'a pre-push hook runs the check', run: () => /check/.test(prePushHooks) || (prePushHooks ? 'hook without a check' : 'no .githooks/pre-push, .husky/pre-push or lefthook.yml'), fix: 'templates/.githooks/pre-push' },
  {
    area: 'checks',
    name: 'the hook is enabled in this clone',
    run: () => {
      if (!isGitRepo) {
        return skip('not a git repo');
      }

      const hooksPath = git('config', 'core.hooksPath').out;

      if (existsSync(join(root, '.githooks/pre-push'))) {
        return hooksPath === '.githooks' || `core.hooksPath is ${JSON.stringify(hooksPath)}`;
      }

      return existsSync(join(git('rev-parse', '--git-common-dir').out.replace(/^(?!\/)/, `${root}/`), 'hooks/pre-push')) || 'no .git/hooks/pre-push';
    },
    fix: 'git config core.hooksPath .githooks (or pnpm exec lefthook install), local to this clone',
  },
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
