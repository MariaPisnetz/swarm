---
title: Add `swarm history` to show what you have donated
size: S
paths: ["src/history.mjs", "src/cli.mjs", "test/**"]
verify: ["node --test .swarm/projects/core/tasks/history-command.test.mjs"]
---
## Goal

Each finished task appends one JSON line to `~/.swarm/history.jsonl` (see `record()` in
`src/worker.mjs`). Volunteers have no way to look at it. Add a `swarm history` command.

## Acceptance

- New module `src/history.mjs` exporting:
  - `readHistory(file)`: returns the parsed entries; a missing file gives `[]`; malformed lines are skipped.
  - `summarizeHistory(entries)`: returns `{ submitted, failed, costUsd, byRunner }` where `byRunner`
    maps a runner name to `{ submitted, failed, costUsd }`. `costUsd` values are rounded to cents.
    Entries have the shape `{ ts, repo, task, status, usage: { costUsd }, runner }`; `usage` may be missing.
- `swarm history` prints the summary and the 10 most recent entries, newest first. `--json` prints
  the summary object as JSON.
- Add the command to the help text in `src/cli.mjs`.
- Unit tests for both functions in `test/`.

The pinned acceptance test is `.swarm/projects/core/tasks/history-command.test.mjs`.
