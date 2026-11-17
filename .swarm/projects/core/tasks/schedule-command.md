---
title: Add `swarm schedule` to print a ready-made timer for expiring quota
size: S
paths: ["src/schedule.mjs", "src/cli.mjs", "test/**"]
verify: ["node --test .swarm/projects/core/tasks/schedule-command.test.mjs"]
---
## Goal

The point of Swarm is to use quota that would otherwise expire. `swarm run --only-if-expiring 12`
already does nothing unless the weekly window resets within 12 hours. Volunteers still have to
write their own timer. Add `swarm schedule`, which prints a snippet they can install. It must only
print; it never installs anything itself.

## Acceptance

- New module `src/schedule.mjs` exporting `scheduleSnippet({ platform, nodePath, binPath, hours, maxTasks })`
  returning `{ kind, text, installHint }`:
  - `platform: 'darwin'` gives `kind: 'launchd'`: a complete launchd plist (label
    `home.swarm.donate`) with `ProgramArguments` running `nodePath binPath run --only-if-expiring <hours> --max-tasks <maxTasks>`
    and a `StartInterval` of 3600 seconds. `installHint` names `~/Library/LaunchAgents/home.swarm.donate.plist` and `launchctl load`.
  - any other platform gives `kind: 'cron'`: one crontab line running the same command hourly
    (minute 17), with `installHint` mentioning `crontab -e`.
  - Defaults: `hours` 12, `maxTasks` 1. Paths containing spaces must stay intact (separate
    `<string>` elements in the plist; quoted in the cron line). XML-special characters in paths
    are escaped in the plist.
- `swarm schedule [--hours n] [--max-tasks n]` prints the text and the hint. Add it to the help text.
- Unit tests in `test/`.

The pinned acceptance test is `.swarm/projects/core/tasks/schedule-command.test.mjs`.
