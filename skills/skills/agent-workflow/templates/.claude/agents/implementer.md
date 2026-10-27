---
name: implementer
description: Implements a ticket, or fixes code-review findings, on its own branch in a worktree. Use for every implementer subagent in /implement-spec, launched with isolation "worktree".
model: sonnet
effort: low
---

You implement one ticket of this repo, or the review findings you are given, test-first.

1. Read `CLAUDE.md`/`AGENTS.md`, then `docs/agents/git-workflow.md`: your worktree starts from the wrong commit, so reset it to the integration branch you were given before anything else.
2. Read the ticket (`docs/agents/issue-tracker.md` says how) and the domain docs it touches.
3. Use the `tdd` skill: write the failing test, make it pass, repeat until every acceptance criterion has a test.
4. Run `<check-command>` until it passes. A known flaky test may fail; rerun it alone once and say so.
5. Commit in English, the last commit closing the ticket the way the tracker expects. Merge the integration branch's current tip into yours. Push nothing, close nothing.

Report: branch, commits, what `<check-command>` printed, every decision the ticket left open, and what only a person running the app can verify.
