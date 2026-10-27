---
name: coding-style
description: "Audit or set up a JS/TS project's tooling baseline (pnpm, Prettier, oxlint + ESLint, strict tsconfig, Vitest, Lefthook, axe, `pnpm check`, CI, AGENTS.md). Use to check a repo's lint/format/test setup, bring a new or existing project up to it, or add a rule to the baseline."
---

The baseline is defined by two things in this skill's folder: `audit.mjs` (one deterministic check per rule) and `templates/` (the config files that make the checks pass). The audit is the source of truth: a project meets the baseline when it exits 0.

## Bring a project up to the baseline

1. Run `node ${CLAUDE_SKILL_DIR}/audit.mjs <repo-root>`.
2. Report the review: per area, what is ok, what fails, and what is skipped as not applying to this project.
3. Turn the FAIL lines into numbered proposals, one per area or per decision, each with what it changes (template to copy or merge, devDependencies, scripts), its cost (e.g. a mass reformat, new lint errors to fix), and a recommendation. Wait for the user to accept or reject each one. A rejected proposal stays out of this run; list its checks as still failing at the end.
4. Apply the accepted proposals:
   - Read the target before writing. Merge templates into existing configs: keep the project's own rules, overrides, ignores, and paths (a `no-restricted-imports` or a Next `rootDir` is project knowledge), and change only what the failing checks name.
   - Adapt the templates to the stack: drop the `react`/`jsx-a11y`/`nextjs` oxlint plugins and the ESLint Next block when the project has no React or Next; point Vitest's `include` at where the tests actually live (it skips the rest silently).
   - Install devDependencies at the root with `pnpm add -D` (`-w` in a pnpm workspace). Then `pnpm exec lefthook install`; on pnpm ≥ 10 its postinstall is blocked until approved with `pnpm approve-builds`.
   - With Playwright, `templates/e2e/accessibility.spec.ts` gets one test per screen or UI state worth scanning (open dialogs and menus, loaded results), with `.include()` to scope it when the app is embedded in a page it does not own. Every existing violation gets fixed or goes to the user.
   - In a monorepo, `type-check` runs per package (`turbo run type-check`) and each package's tsconfig `extends` the root one.
5. Re-run the audit until every accepted check passes.
6. Run `pnpm format`, then `pnpm lint:fix`, then `pnpm check`. Fix what remains by hand; an error that needs a design decision goes to the user instead of a disable comment. Keep the mass reformat in its own commit and add that commit's hash to `.git-blame-ignore-revs`, so `git blame` skips it.

Done when every accepted check passes and `pnpm check` ends with four `ok` lines, and the user has the list of what still fails (rejected or blocked) and why. Propose the commits (message and files) and let the user commit.

While reviewing, note what the project does well that the baseline lacks (a lint rule, a hook, a script, a CI step) and offer each as a numbered proposal for the baseline itself; an accepted one goes through "Add a rule to the baseline".

## Add a rule to the baseline

When the user brings a convention from another project into the baseline:

1. Add the setting to the matching file in `templates/` (a new tool gets a new template file).
2. Add one entry to `CHECKS` in `audit.mjs` that fails without it, with a `fix` naming the template or the command.
3. Prove the check bites: it passes on a project that has the setting (copy `templates/` into a temp git repo with a matching `package.json`) and fails after you remove it by hand.
4. Run the audit on a project of the user's that already meets the baseline (ask which). A new FAIL there means either that project lacks the rule (tell the user) or the check is too strict.

Keep the skill's text, templates, and comments in English.
