# Swarm plugin

Install the plugin, choose an open-source project, and the Claude quota you were not going to use
is spent doing tasks that project's maintainers wrote.

## Install

In Claude Code:

```
/plugin install swarm --marketplace serg1210/swarm
```

In the Claude desktop app or claude.ai: Customize > Plugins > Add > Add marketplace, enter
`serg1210/swarm`, then install Swarm.

## Use it

1. Say "set up Swarm". Claude shows the projects that opted in and you choose one.
2. Claude offers to schedule the leftover run: on your computer, or in the cloud so it runs with
   your laptop closed.
3. Each run does one task: it claims it, writes the change, runs the project's checks, and opens
   a pull request under your GitHub account. Say "donate quota with Swarm" to run one now.

The skill carries its own copy of the Swarm CLI, so it works in Claude Code on your computer and
in Claude Code cloud sessions and scheduled tasks. The plugin also adds a local connector, which
is what submits work from Cowork sessions that run on your computer. Chat alone cannot run it.

## Data

Swarm reads public repositories of the projects you chose and writes to GitHub as you: signed
claim comments on task issues, and pull requests from your account or fork. On your computer it
uses your `gh` login; in a cloud session it uses that session's GitHub connection. It sends
nothing to any Swarm server; there is none. It never reads subscription credentials.

Source: https://github.com/serg1210/swarm
