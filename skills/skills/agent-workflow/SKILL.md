---
name: agent-workflow
description: "Audit or set up a repo's agent workflow: spec → tickets → Sonnet (low) implementers in worktrees off an integration branch → Opus (medium) two-axis code review → merge. Checks the agent types in `.claude/agents/`, the CLAUDE.md/AGENTS.md wiring, the git-workflow doc, the issue tracker doc, the check command and its pre-push hook, and worktree hygiene. Use to check whether a repo is ready for /implement-spec and /code-review, bring it up to the baseline, or add a rule to it."
---

The baseline is defined by two things in this skill's folder: `audit.mjs` (one deterministic check per rule) and `templates/` (the files that make the checks pass). The audit is the source of truth: a repo meets the baseline when it exits 0.

## The workflow it checks

| Step | Who | `model` | `effort` |
| --- | --- | --- | --- |
| Spec and tickets | the user's session (`/to-spec`, `/to-tickets`) | — | — |
| Orchestration | the user's session (`/implement-spec`) | — | — |
| Implement a ticket, fix review findings | `implementer` agent type, `isolation: "worktree"` | `sonnet` | `low` |
| Review, Standards and Spec axes | `reviewer` agent type, read-only | `opus` | `medium` |

Model and effort live in the agent type's frontmatter, not in the prompt, so every skill that spawns the agent gets them. The aliases resolve to the newest installed version; don't pin one.

`isolation: "worktree"` branches from the main checkout's `HEAD`, not from the integration branch, so the implementer's first step is resetting its worktree onto the integration branch it was given.

## Bring a repo up to the baseline

1. Run `node ${CLAUDE_SKILL_DIR}/audit.mjs <repo-root>`.
2. Report the review: per area, what is ok, what fails, and what is skipped as not applying.
3. Turn the FAIL lines into numbered proposals, one per area or per decision, each with what it changes (template to copy or merge, doc section to add, git config) and a recommendation. Wait for the user to accept or reject each one. A rejected proposal stays out of this run; list its checks as still failing at the end.
4. Apply the accepted proposals:
   - Read the target before writing. Merge templates into existing files: keep the repo's own steps, paths and domain docs (a GLOSSARY, ADRs, a platform with no test target), and change only what the failing checks name.
   - Replace `<check-command>` in the templates with the repo's single check command (`scripts/check.sh`, `pnpm check`). A repo without one gets it from `/ale:coding-style` first, or from the user.
   - Point the implementer's step 2 at the repo's issue tracker doc and domain docs. When `docs/agents/issue-tracker.md` is missing, tell the user to run `/setup-matt-pocock-skills` instead of writing it yourself.
   - Make sure `.claude/agents/` is committed while the rest of `.claude/` (worktrees, local settings) stays ignored: `/.claude/*` plus `!/.claude/agents/` in `.gitignore`.
   - Hooks enabled per clone (`git config core.hooksPath .githooks`, `pnpm exec lefthook install`) are local config: run them only with the user's go-ahead.
5. Re-run the audit until every accepted check passes.

Done when every accepted check passes and the user has the list of what still fails (rejected or blocked) and why. Propose the commit (message and files) and let the user commit.

While reviewing, note what the repo does well that the baseline lacks (a step in the implementer, a guard in the git workflow, a hook) and offer each as a numbered proposal for the baseline itself; an accepted one goes through "Add a rule to the baseline".

Flag, without fixing, any global skill or doc that contradicts the repo's workflow (a skill that forbids `isolation: "worktree"`, a merge strategy that differs from the repo's git-workflow doc). The repo's docs win inside the repo.

## Add a rule to the baseline

1. Add the setting to the matching file in `templates/` (a new file gets a new template).
2. Add one entry to `CHECKS` in `audit.mjs` that fails without it, with a `fix` naming the template or the command.
3. Prove the check bites: copy `templates/` into a temp git repo, fill in `<check-command>`, see it pass, remove the setting by hand and see it fail.
4. Run the audit on a repo of the user's that already meets the baseline (ask which). A new FAIL there means either that repo lacks the rule (tell the user) or the check is too strict.

Keep the skill's text, templates and comments in English.
