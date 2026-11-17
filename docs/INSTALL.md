# Install Swarm

Swarm is three steps: install the plugin, choose a project, and your leftover quota does tasks
that project's maintainers wrote. This page covers each place it can run.

| Where | Who writes the change | Knows your quota | Tested by the maintainers |
|---|---|---|---|
| Claude Code on your computer | The official CLI, started by Swarm with no shell and no network | Yes, keeps a 20% reserve | Yes |
| Claude Code cloud session or cloud scheduled task | The session's own agent, in its VM | No; scheduled before the weekly reset | On a local stand-in only |
| Cowork on your computer | The official CLI if installed, else Cowork's agent through the connector | Only with the CLI installed | No |
| Codex or Hermes | That agent, through the connector | No | No |

Wherever it runs, Swarm does the claim, the path-policy check, the project's verify steps, the
signed receipt and the pull request, under your own GitHub identity.

## Claude Code on your computer

```
/plugin install swarm --marketplace serg1210/swarm
```

Then say "set up Swarm". Claude shows the projects that opted in, saves your choice, and offers
to schedule a daily local run. "Donate quota with Swarm" runs one task now.

Needs Node 20 or newer, `git`, and the [`gh`](https://cli.github.com) CLI logged in.

## Claude Code in the cloud

Cloud sessions and cloud scheduled tasks run in a VM that Anthropic manages, with Node, git and
`gh` installed, and they draw on the same plan as everything else you do. That makes them the
way to spend leftover quota with your laptop closed.

1. Install the plugin on your account: claude.ai > Customize > Plugins > Add > Add marketplace >
   `serg1210/swarm`. Its skill then loads in cloud sessions, and carries the Swarm CLI with it.
2. Create a cloud scheduled task (`/schedule` in a local Claude Code session, or
   claude.ai/code/routines):
   - **Repository:** the project's repository if you can push to it. Otherwise your fork of it
     and the project's repository, with the environment variable `SWARM_FORK=you/fork`.
   - **Schedule:** weekly, six to twelve hours before your weekly window resets (see
     claude.ai/settings/usage). A cloud session cannot read your quota, so timing is what makes
     it leftover. If the limit is already reached, the run is simply rejected.
   - **Prompt:** `Run the swarm skill for the project owner/repo#project and do at most one
     task. Report the pull request link, or in one line why nothing was submitted.`
3. Optional: set `SWARM_HANDLE` to your GitHub login, and `SWARM_IDENTITY` to the output of
   `swarm identity export` on your computer, so every run signs as the same worker.

What is different in the cloud, and what is not yet proven:

- GitHub is reached through the session's connection, only for repositories attached to the
  task, and only through GitHub's REST API. Swarm uses nothing else.
- The project's checks run in the session's VM. It is disposable and holds no credentials, so it
  stands in for the sandbox; its network follows the cloud environment's settings instead of
  being off. Receipts record this as `cloud-vm`.
- **Not yet run in a real cloud session.** The same path (skill, bundled CLI, an agent doing the
  task, REST) is tested on a laptop standing in for one. Pushing through the cloud GitHub
  connection, and submitting from a fork there, have not been exercised.

## Cowork in the Claude desktop app

1. **Customize > Plugins > Add > Add marketplace**, enter `serg1210/swarm`, install **Swarm**.
2. Start a Cowork task that runs on your computer and say "set up Swarm".

A Cowork task's own shell can clone from GitHub but cannot push, so here the plugin's connector
does the claiming and submitting. The connector is a program on your computer (marked "Runs in
each session"), which is why this needs a session that runs on your computer. For runs with the
computer off, use a Claude Code cloud scheduled task as above. Not yet tested by the maintainers.

## Codex

Not yet tested by the maintainers (written from the Codex documentation).

```bash
npm install -g github:serg1210/swarm
```

```bash
codex mcp add swarm -- swarm mcp
```

Codex waits 60 seconds for a tool call by default, and verification can take longer. In
`~/.codex/config.toml`:

```toml
[mcp_servers.swarm]
command = "swarm"
args = ["mcp"]
tool_timeout_sec = 900
```

Add the skill (the instructions only; with `swarm` installed globally, read `SWARM` in it as the `swarm` command):

```bash
mkdir -p ~/.codex/skills/swarm && curl -fsSL https://raw.githubusercontent.com/serg1210/swarm/main/plugin/skills/swarm/SKILL.md -o ~/.codex/skills/swarm/SKILL.md
```

Daily run, from your own crontab (`crontab -e`):

```
0 18 * * * codex exec "Run the swarm skill. Do at most one task."
```

Two things to know. OpenAI's documentation recommends API keys rather than a ChatGPT login for
automation, so read your plan's terms before putting a subscription on a timer. And if all you want
is Codex doing Swarm tasks, `swarm run --runner codex` does that without the connector.

## Hermes

Not yet tested by the maintainers (written from the Hermes Agent documentation).

```bash
npm install -g github:serg1210/swarm
```

Add the connector to `~/.hermes/config.yaml`:

```yaml
mcp_servers:
  swarm:
    command: "swarm"
    args: ["mcp"]
    timeout: 900
```

```bash
hermes mcp test swarm
```

Add the skill:

```bash
mkdir -p ~/.hermes/skills/swarm && curl -fsSL https://raw.githubusercontent.com/serg1210/swarm/main/plugin/skills/swarm/SKILL.md -o ~/.hermes/skills/swarm/SKILL.md
```

Daily run:

```bash
hermes cron create "every day at 6pm" "Run the swarm skill. Do at most one task." --skill swarm --name swarm-leftover
```

Hermes runs scheduled agent jobs inside its gateway, so the gateway has to be running
(`hermes gateway install`). Hermes names the tools `mcp_swarm_swarm_status` and so on. With no
Claude Code or Codex CLI on the machine, the skill uses connector mode: Hermes does the task
itself.

## Any other MCP host

Point it at the command `swarm mcp` (after `npm install -g github:serg1210/swarm`) or
`npx -y github:serg1210/swarm mcp`. The tools describe themselves; start with `swarm_status`.

## No agent host at all

Run the CLI from your own timer. This line does nothing unless your weekly window resets within
12 hours:

```
17 * * * * npx -y github:serg1210/swarm run --only-if-expiring 12
```

## Three ways Swarm gets the change written

- **It starts the official CLI** (`swarm run`, or `swarm_donate` through the connector). The CLI
  runs boxed in: no shell, no network, files only. This is the cheapest way and the only one
  that reads your quota windows and keeps a reserve. Needs Claude Code or Codex on the machine.
- **Your agent writes it through the connector** (`swarm_begin`, the file tools, `swarm_finish`).
  For hosts with no agent CLI. The file tools refuse absolute paths, `..`, `.git`, symlinks that
  leave the clone, protected files and anything outside the task's allowed paths.
- **Your agent writes it over a shell** (`swarm task begin`, then `swarm task finish`). For cloud
  sessions and any host with a shell and no connector. Swarm hands the agent a directory; nothing
  confines the agent, and the policy check at the end rejects changes outside the task.

In the last two, Swarm cannot see the host's quota, and the host and model in the receipt are
self-reported. Cost also depends on what else the host has loaded: the same task cost $0.13
API-equivalent from a host with only Swarm, and hit a $2.50 cap after five turns from a host with
about 70 other connectors.
