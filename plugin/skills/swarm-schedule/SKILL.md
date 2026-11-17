---
name: swarm-schedule
description: Set up a daily Swarm donation run. Use when the user asks to schedule Swarm, run it every day, or donate quota automatically.
---

Set up one recurring task that runs the `swarm-donate` skill once a day.

## What to create

- **Where it runs:** on this computer. The Swarm connector is a local program that needs the
  user's git, GitHub login and sandbox, so a schedule that runs in the cloud cannot reach it.
  In the Claude desktop app, create a local scheduled task, not a cloud routine. If only a cloud
  schedule is available, say so and stop.
- **When:** once a day, at a time the user picks. Suggest a time shortly before they usually
  stop working, when spare quota is known.
- **Prompt for the task:** `Run the swarm-donate skill. Do at most one task. If Swarm says the
  quota reserve is reached or there is no open task, report that in one line and stop.`
- **Name:** `swarm-daily-donation`.

## Before creating it

1. Call `swarm_status`. If the sandbox is unavailable or `githubLogin` is false, explain what to
   fix first and stop.
2. Show the user the chosen projects from `swarm_status` and confirm these are where their
   quota should go. Change them with `swarm_choose` only if they ask.
3. Tell the user plainly: the task runs only while this computer is awake and the app is open,
   it keeps 20% of the 5-hour and weekly windows untouched by default, and it does one task a day.
4. Create the schedule only after the user says yes.

## Other hosts

If you are not running in the Claude desktop app, use the host's own scheduler with the same
prompt. `docs/INSTALL.md` in the Swarm repository lists the command for Hermes and Codex.
