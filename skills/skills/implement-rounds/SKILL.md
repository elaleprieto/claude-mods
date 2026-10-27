---
name: implement-rounds
description: "Implement the rounds agreed in this session: Sonnet (low effort) implementers in parallel worktrees, an Opus (medium effort) /code-review per round, and one commit per round once the user approves its findings."
disable-model-invocation: true
---

The spec was discussed earlier in this session and is split into rounds. Implement every round with subagents: independent rounds in parallel, dependent ones in later waves. Each round gets reviewed and lands as one commit on the user's branch.

You orchestrate. You write the round specs, plan the waves, manage worktrees, and talk to the user. Subagents implement and review.

## Models

| Role | `model` | `effort` |
| --- | --- | --- |
| Implementer | `sonnet` | `low` |
| Reviewer and fixer | `opus` | `medium` |

The aliases resolve to the newest installed version, so don't pin one.

Don't use `isolation: "worktree"`. It branches from the default branch, not from the current `HEAD`, so the agent wouldn't see this branch's work. Create worktrees by hand instead (step 3).

## Rules

- The user's approval of a round's findings also approves its commit: you commit the squashed round on the user's branch (step 6). Subagents commit only on their scratch worktree branches. Neither adds a `Co-Authored-By` trailer.
- Never push.
- Talk to subagents through pointers: the round spec file, the repo's `AGENTS.md`/`CLAUDE.md` and the docs those files point to. Don't paste the conversation into prompts.

## 1. Write the round specs

Subagents start cold and never see this conversation, so everything agreed here has to go into a file. Write one file per round to `/tmp/implement-rounds/<feature>/round-NN.md`. Each file covers:

- **Goal**: what changes for the user or the system, in two or three lines.
- **Decisions**: everything agreed in the session that affects this round, with the reason for each. The reasons let the implementer handle cases the spec doesn't mention.
- **Where**: the files, modules and docs involved, including any doc the repo's `AGENTS.md` says to read before touching that area.
- **Tests**: the behaviour to test and at which seam.
- **Out of scope**: what belongs to other rounds or was explicitly dropped.

If the rounds already live in a repo doc, point to the right section of it instead of copying it. A worktree holds only tracked files, so point to a gitignored doc (check with `git check-ignore -q <path>`) by its absolute path in the main checkout.

## 2. Plan the waves and wait for approval

Round B goes in a later wave than round A when either of these holds:

- B builds on something A adds, such as a schema, a function or a UI piece.
- B and A edit the same files heavily, or both add to a shared sequence (migration numbers, a file list in a migration runner, registries). Parallel edits there conflict at merge time.

Everything else runs in parallel.

Show the plan as a table with these columns: round, what it does, depends on, wave, main files. Also check `git status`: squash-merging needs a clean working tree, so if it isn't clean, ask the user what to do. Wait for "dale" before starting.

## 3. Create the wave's worktrees

Record the base commit with `BASE=$(git rev-parse HEAD)`. For each round in the wave:

```sh
git worktree add -b rounds/<feature>-NN <wt-root>/<feature>-NN "$BASE"
```

For `<wt-root>`, use `.claude/worktrees` if git ignores it (`git check-ignore -q .claude/worktrees/x`). Otherwise use `../<repo>-worktrees`.

Make each worktree runnable. If the repo's `AGENTS.md`/`CLAUDE.md` names a worktree setup script, run it and skip this list:

- Install dependencies (`pnpm install --frozen-lockfile`, or whatever the repo uses).
- Symlink the gitignored env files (e.g. `.env.local`) from the main checkout, plus any per-app symlinks the repo expects.

## 4. Implement

Spawn all of the wave's implementers in one message, in the background. Each prompt contains:

- **Worktree path.** All work happens there. Use absolute paths with Read/Edit, and start every Bash command with `cd <worktree> &&`, because the shell's cwd resets to the main checkout. Never touch the main checkout.
- **Spec path**, plus "read the repo's `AGENTS.md`/`CLAUDE.md` first".
- **Workflow.** Use the `tdd` skill at the seams the spec names. Run type-checking and single test files often, and the repo's full pre-commit check (e.g. `pnpm check`) at the end.
- **Mutation check.** Red-green proves a new test can fail, but a test written for behaviour that already exists starts green and may guard nothing. For every such test, and for every security guard the round touches (tenancy, scoping, permissions), mutate the implementation by hand: return a fake constant, drop a guard, invert a condition, widen a filter. Run the test and watch it fail, then revert and watch it pass. If a mutation survives, strengthen the test. Mutate only after committing (see Finish), so `git checkout -- <file>` reverts exactly the mutation; revert each one before the next, and commit any strengthened test once `git diff` holds no mutation.
- **Shared resources.** The local database, Docker services and dev-server ports are shared with the user and the other worktrees. Don't start dev servers, and don't apply migrations to the shared database. If a migration needs applying, say so in the report. To run a migration or DB-backed tests against the changed schema, use the scratch-database script the repo's `AGENTS.md` names, if any, and drop the database before finishing.
- **Finish.** Commit on the worktree branch as `<type>: <summary>`, without a trailer.
- **Report**, under 250 words: what changed, the files touched, the check result, the mutations tried (each as file, change, and the test that caught it or "survived"), any deviation from the spec or anything left undone, and open questions.

## 5. Review each round as soon as it lands

When an implementer finishes, start that round's reviewer right away, without waiting for the rest of the wave. Give the reviewer:

- **Worktree path**, with the same cwd rule and the same shared-resources rule as the implementers.
- **What to run.** Follow the `code-review` skill with fixed point `$BASE` and the round spec path as the spec. The spec path is enough even if the repo has no issue-tracker setup. If the reviewer can't spawn sub-agents, it runs the Standards axis and then the Spec axis itself and keeps the two reports separate.
- **Mutation probe.** After both axes, it tries up to five mutations of its own on the round's riskiest logic, security guards first, skipping the ones the implementer already reported (paste that list into the prompt). Same loop: mutate, run the tests, `git checkout -- <file>`. Each surviving mutation becomes a finding naming the mutation and the test that should catch it. It leaves the worktree with no diff.
- **No fixes yet.** It returns the findings numbered, each with a recommendation (fix or skip) and a one-line reason.

Keep the reviewer's agent ID. The same agent applies the fixes later, so it doesn't have to load the context again.

## 6. Close one round at a time

Close each round on its own, even when the whole wave finished together, so each one gets its own commit.

1. Show the user a short summary of the implementer's report and the review findings as a numbered list with your recommendation, plus the commit message you'll use (in the repo's style, check `git log --oneline -10`). Wait for their choice. Their answer approves both the findings and the commit.
2. Use SendMessage to send the approved findings to that round's reviewer. It applies them in the worktree, reruns the full check, commits, and reports back.
3. Integrate into the user's branch: `git merge --squash rounds/<feature>-NN`. This stages the changes without committing. Resolve trivial conflicts. Otherwise stop and show the conflict.
4. Commit the staged round with the approved message, without a trailer. Report the hash and the branch from `git log -1 --format='%h %s' && git branch --show-current`, plus any migrations to apply. If the pre-commit hook fails, show the failure and stop.
5. Remove the worktree with `git worktree remove <path>` and delete its branch with `git branch -D rounds/<feature>-NN`. `-D` is needed because git doesn't count a squash as a merge.

If an implementer fails or its check stays red after one retry, show the user what happened instead of retrying in a loop.

## 7. Next wave

Once every round of a wave is committed, go back to step 3. The new worktrees branch from the new `HEAD`, so dependent rounds build on the committed work.

When the last round is committed, give a short wrap-up: the commits made, findings that were skipped, and pending steps such as migrations, manual checks or docs.
