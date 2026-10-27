---
name: quick-wins
description: "Pick short, high-impact tasks from the repo's priorities doc to check off next."
disable-model-invocation: true
---

Propose the next tasks to check off from the repo's priorities doc (the one `AGENTS.md` names for picking the next task, e.g. `docs/PRIORITIES.md`). A quick win is short, and its impact shows: in the chat, in a demo, in a tenancy or security rule, or as one more item crossed off.

1. Read the open items of the priorities doc.
2. For each candidate, check the code and `git log` before proposing it. An item already fixed is a free win: propose crossing it off with the commit that fixed it.
3. Propose 3 to 5 items, numbered and sorted from shortest to longest. For each give its size (e.g. "~30 min", "half a day"), its impact, and how it gets verified. Flag the ones that need a paid API, a product decision or a push to verify.
4. List the items you considered and skipped, one line each with the reason.
5. Recommend which to bundle into one `/implement` run, and which to do next.

Wait for the user's pick. Change nothing before they choose.
