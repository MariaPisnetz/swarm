# Swarm plugin

Spend the Claude Code or Codex quota you will not use this week on open-source projects you
choose. This plugin adds a local connector and two skills.

## Install

In Claude Code:

```
/plugin install swarm --marketplace serg1210/swarm
```

In the Claude desktop app (Cowork): Customize > Plugins > Add > Add marketplace, enter
`serg1210/swarm`, then install Swarm.

## Use it

Ask Claude to "donate quota with Swarm" or run `/swarm:swarm-donate`. Claude checks your quota
windows, claims one task that a project's maintainers wrote, and either starts the official CLI
on your machine or does the task itself through file tools confined to a fresh clone. Swarm then
runs the project's checks in a sandbox, signs a receipt and opens the pull request. Run
`/swarm:swarm-schedule` to set up a daily run.

The connector is a local program, so it works in Claude Code and in Cowork sessions that run on
your computer in the desktop app. It does not load in chat or in cloud scheduled tasks. It needs
Node 20 or newer, `git`, and the `gh` CLI logged in.

## Data

The connector runs on your computer. It reads public repositories of the projects you chose and
writes to GitHub through your own `gh` login: signed claim comments on task issues, and pull
requests from your account or fork. It sends nothing to any Swarm server; there is none. It
never reads subscription credentials.

Source: https://github.com/serg1210/swarm
