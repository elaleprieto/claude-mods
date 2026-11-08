---
name: wrap
description: "Close a work session: stop the Docker containers the project's tests left running, without pulling them from under a test that is still running."
disable-model-invocation: true
---

End a work session by freeing Docker. Test suites often keep their servers running between runs (databases, mail servers), and they pile up across worktrees and sessions.

1. Wait until no test or check of this session is still running, then stop every background task of yours.
2. List what is running: `docker ps --format '{{.Names}}\t{{.Image}}\t{{.Status}}'`. If nothing is running, say so and stop.
3. Find the project's own way to stop its test containers, and use it in preference to `docker`. Look for:
   - a skill named like `stop-test-servers`;
   - a script under `scripts/` that stops or cleans up the test servers;
   - the stop command in `AGENTS.md` or `CLAUDE.md`.

   These usually skip containers that a test in another session is still using. Run it and report its summary. If it left some running because they are in use, name them and say another session is testing.
4. If the project has no such tool, stop only the containers that clearly belong to it (by name prefix, image, or compose project), with `docker stop`. Before stopping anything else, ask: another project or session may be using it.
5. Run `docker ps` again and report what is still running, and why.

Remove nothing beyond containers: no images, no volumes, no `docker system prune`.
