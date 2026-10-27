// Runs the four pre-commit checks (the same ones CI runs) and ends with one line per check.
// Every check runs even if an earlier one fails. A failing check prints the tail of its output; lint
// and type-check print only their error lines, so lint's standing warnings and turbo's logs don't bury them.
import { spawnSync } from 'node:child_process';

const CHECKS = ['lint', 'format:check', 'type-check', 'test'];
const ERRORS_ONLY = new Set(['lint', 'type-check']);
const TAIL_LINES = 40;

const results = CHECKS.map((name) => {
  const run = spawnSync('pnpm', ['run', '--silent', name], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const ok = run.status === 0;

  if (!ok) {
    let lines = `${run.stdout}${run.stderr}`.trimEnd().split('\n');

    if (ERRORS_ONLY.has(name)) {
      lines = lines.filter((line) => /\berror\b/i.test(line));
    }

    console.log(`\n--- ${name} failed (last ${TAIL_LINES} lines) ---`);
    console.log(lines.slice(-TAIL_LINES).join('\n'));
  }

  return { name, ok };
});

console.log('');

for (const { name, ok } of results) {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`);
}

process.exit(results.every((r) => r.ok) ? 0 : 1);
