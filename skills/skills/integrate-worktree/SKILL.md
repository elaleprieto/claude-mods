---
name: integrate-worktree
description: "Integrate the current worktree branch on the default branch (or a named one): rebase it, run the checks, fast-forward, push only on approval, and clean up."
disable-model-invocation: true
---

Integrate the branch of the current checkout on its target branch with a linear history. The user runs this at the end of a session that worked in a worktree.

## 1. Find the branch, the target and their checkouts

- **Branch**: `git branch --show-current`. If it is empty (detached HEAD), stop and ask.
- **Target**: the branch the user named, else the remote default branch (`git symbolic-ref --short refs/remotes/origin/HEAD`, minus the `origin/`), else `main`.
- If the branch is the target, there is nothing to integrate. Say so and stop.
- **Target checkout**: run `git worktree list --porcelain` and find the worktree that has the target checked out, if any. Usually it is the main checkout.

## 2. Check before touching anything

- The current worktree must be clean (`git status --porcelain`). If it isn't, show the changes and ask whether to commit them first.
- The target checkout, if there is one, must be clean too, because the fast-forward updates its files.
- Show `git log --oneline <target>..HEAD`. If it is empty, the work is already on the target. Skip to step 6.
- Show `git log --oneline HEAD..<target>`. These are the commits that landed on the target since this branch started.
- If the remote is ahead of the local target (`git fetch` first, then compare), tell the user before going on.

## 3. Rebase onto the target

Run `git -c merge.conflictStyle=diff3 rebase <target>` inside the current worktree.

If there are conflicts, resolve the mechanical ones yourself: imports, unions of independent additions, renames from the other side. A conflict where both sides change the same behaviour needs the user, so stop and show it. Never use `-X ours`/`-X theirs` to make a conflict go away.

## 4. Run the checks

Run the project's full test suite, linters and build, as the repo's `AGENTS.md`/`CLAUDE.md`/README describes. A fresh worktree may lack gitignored files (generated code, env files, dependencies), so recreate them from the main checkout or the repo's setup script first.

If something fails, tell a flaky failure (rerun it alone and it passes) apart from a real one. Fix real ones that the rebase caused as fixups to the commit they belong to, then `git rebase -i --autosquash` non-interactively (`GIT_SEQUENCE_EDITOR=true`). Otherwise stop and report.

## 5. Fast-forward the target

- Target checked out in another worktree: `git -C <target-checkout> merge --ff-only <branch>`.
- Target not checked out anywhere: `git fetch . <branch>:<target>`, which refuses anything that isn't a fast-forward.

Never merge with a merge commit or force anything. If the fast-forward fails, the target moved: go back to step 3.

Then ask before pushing. On approval, push the target: `git -C <target-checkout> push origin <target>`, or `git push origin <target>` if it isn't checked out anywhere. If the branch had an upstream, offer to delete the remote branch.

## 6. Clean up

The worktree you are in can't be removed from inside, and the tool that created it may track it. Tell the user how to remove it (see below), then delete the branch with `git branch -d <branch>`, which refuses if anything isn't on the target.

If git created the worktree by hand, the user can run `git worktree remove <path>`.

## Orca

The worktree is probably an Orca workspace when its path is under `~/orca/workspaces/` or `env | grep '^ORCA_'` shows variables. In that case:

- Orca creates each workspace branch from the repo's base ref, not from whatever was checked out. If the branch didn't start from the target, say so. `orca repo set-base-ref` changes the base for future workspaces.
- Don't run `git worktree remove` or delete the branch while the workspace still exists in Orca, because its state would go out of sync. Tell the user to delete the workspace in Orca: right-click it, then Delete. Then check `git branch` and delete the branch if it's still there.
- If several Orca workspaces are open on the same repo, list their branches (`git worktree list`) and tell the user which ones now need `/ale:integrate-worktree` on top of the new target.
