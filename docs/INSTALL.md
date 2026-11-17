# Install Swarm in your agent

Swarm runs three ways. Pick the one that matches the agent you already use.

| | What you install | Who edits the code | Tested by the maintainers |
|---|---|---|---|
| **Plain CLI** | `npx github:serg1210/swarm run` | The official Claude Code or Codex CLI, started by Swarm with no shell and no network | Yes, with Claude Code |
| **Connector, delegate mode** | The Swarm connector in your agent | Same as above; your agent only starts the run and reports back | Yes, in Claude Code |
| **Connector, connector mode** | The Swarm connector in your agent | Your agent itself, through file tools that reach only the task's clone | Yes, in Claude Code; not yet in Cowork, Codex or Hermes |

In every mode Swarm does the claim, the path-policy check, the sandboxed verification, the signed
receipt and the pull request, on your machine, under your own GitHub login.

The connector is a local program (`swarm mcp`, MCP over stdio). It needs Node 20 or newer, `git`,
and the [`gh`](https://cli.github.com) CLI logged in. It cannot run in a cloud session, because it
needs your machine's git, GitHub login and sandbox.

## Claude Code

```
/plugin marketplace add serg1210/swarm
```

```
/plugin install swarm@swarm-at-home
```

Then ask Claude to "donate quota with Swarm", or run `/swarm:swarm-donate`.

Without the plugin, add just the connector:

```bash
claude mcp add swarm -- npx -y github:serg1210/swarm mcp
```

## Claude desktop app (Cowork)

1. Open **Customize > Plugins > Add > Add marketplace** and enter `serg1210/swarm`.
2. Install **Swarm**. Its connector is marked "Runs in each session": it is a program on your
   computer.
3. Start a Cowork session that runs on your computer and ask Claude to "donate quota with Swarm".

The connector does not load in chat, or in Cowork sessions and scheduled tasks that run in the
cloud. Not yet tested by the maintainers in the desktop app; the same plugin is tested in Claude
Code.

### Daily run

Ask Claude to run `/swarm:swarm-schedule`, or say "schedule Swarm daily". It sets up a **local**
scheduled task that runs the `swarm-donate` skill once a day. Local tasks run only while the app is
open and the computer is awake. A cloud scheduled task cannot reach the connector.

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

Add the skill:

```bash
mkdir -p ~/.codex/skills/swarm-donate && curl -fsSL https://raw.githubusercontent.com/serg1210/swarm/main/plugin/skills/swarm-donate/SKILL.md -o ~/.codex/skills/swarm-donate/SKILL.md
```

Daily run, from your own crontab (`crontab -e`):

```
0 18 * * * codex exec "Run the swarm-donate skill. Do at most one task."
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
mkdir -p ~/.hermes/skills/swarm-donate && curl -fsSL https://raw.githubusercontent.com/serg1210/swarm/main/plugin/skills/swarm-donate/SKILL.md -o ~/.hermes/skills/swarm-donate/SKILL.md
```

Daily run:

```bash
hermes cron create "every day at 6pm" "Run the swarm-donate skill. Do at most one task." --skill swarm-donate --name swarm-daily-donation
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

## What the connector can and cannot do

- **Delegate mode** (`swarm_donate`, `swarm_review`) starts `swarm run` in the background and
  returns a job id; the host polls `swarm_job`. The agent that edits code is the official CLI in
  restricted mode, exactly as with the plain CLI. This is the cheapest mode and it reads your
  quota windows first.
- **Connector mode** (`swarm_begin`, the file tools, `swarm_finish`) is for hosts with no agent CLI
  on the machine. The host's own model does the task. The file tools refuse absolute paths, `..`,
  `.git`, symlinks that leave the clone, protected files and anything outside the task's allowed
  paths. Swarm cannot see the host's quota in this mode, so it cannot keep a reserve for you; the
  host's schedule and "one task per run" are the limit. The receipt records the host and model as
  self-reported.
- **Cost in connector mode depends on your host.** Every request carries everything else your host
  has loaded. In our test the same task cost $0.13 API-equivalent from a host with only the Swarm
  connector, and hit a $2.50 cap after five turns from a host with about 70 other connectors
  loaded. Use delegate mode when you can.
- **The connector does not confine your host.** If your host also has a shell, nothing in Swarm
  stops it from using it. The skill tells it not to, the change is still policy-checked and
  verified in the sandbox, and only maintainer-merged task files are ever shown to it.
