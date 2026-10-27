# Git workflow

Several sessions often work on this repo at once, each in its own worktree, while `main` keeps moving.

- **Main checkout**: stays on `main`. Create an integration branch with `git branch <name> main`, never `git switch -c`, so you don't move another session's checkout.
- **Implementer worktrees** start from the main checkout's `HEAD`, not from the integration branch. First command in one: `git reset --hard <integration-branch>`.
- **Checks**: `<check-command>` before merging to `main`; a fast variant runs on every push (`.githooks/pre-push`, enabled with `git config core.hooksPath .githooks`).
- **Into `main`**: a merge commit, `git merge --no-ff <branch> -m "Merge <branch>: <what it does>"`. When `main` moved meanwhile, merge `main` into the branch first, run `<check-command>`, then merge the branch into `main`. Never rebase a branch that is shared or has been merged from.
- **Cleanup**: `git branch -d` checks against `main`, so it refuses branches merged only into the integration branch. Confirm with `git merge-base --is-ancestor <branch> <integration-branch>`, then `git branch -D`. Remove worktrees with `git worktree remove <path>`, never `--force`: a dirty worktree holds work.
- **Issues**: closed only from `origin/main`; see `docs/agents/issue-tracker.md`.
