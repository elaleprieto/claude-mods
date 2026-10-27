<!-- Merge into CLAUDE.md or AGENTS.md. -->

- **Checks**: `<check-command>` must pass before anything merges to `main`; `docs/agents/git-workflow.md` covers branches, worktrees and merging.

### Subagents

Implementers (tickets and review fixes) are the `implementer` agent type, with `isolation: "worktree"`; both `/code-review` axes are the `reviewer` agent type. Their model and effort live in `.claude/agents/`.
