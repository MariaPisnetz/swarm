# Swarm

Put the Claude Code or Codex quota you are not going to use this week to work on open-source tasks,
and get back pull requests that have been verified three times before a maintainer sees them.

The agent runs **on your machine**, through the **official CLI**, under **your own login**. Nothing
is pooled or relayed, and no token leaves your computer. Swarm is the part around the agent: it
picks a task a maintainer wrote, boxes the agent in, runs the project's checks in a sandbox, signs
a receipt and opens the pull request.

```
$ swarm run --task core/glob-braces
› Checking your quota
  5-hour: 21% used, resets in 4h 30m; weekly: 39% used, resets in 3d 23h
› Claiming core/glob-braces: Support {a,b} alternation in path globs
› Agent claude working (attempt 1/2, budget $2.00)
› Verifying in seatbelt sandbox
›   unit-tests: node --test test/*.test.mjs
›   task-1: node --test .swarm/projects/core/tasks/glob-braces.test.mjs
✓ Verified: unit-tests, task-1 (2 files, 34 lines)
✓ Submitted core/glob-braces → branch swarm/core/glob-braces/4d828f4f  ($0.09 API-equivalent, 25s)

$ swarm review          # a different worker, on a different key
› Reviewing core/glob-braces from worker 4d828f4f
✓ Verification reproduced
› Agent claude reading the change
✓ Review posted: approve
```

That is the output of a real run during development (Claude Sonnet, against a local test remote).

> **Status: v0.1, launched today.** The Claude Code runner and the macOS sandbox are tested end to
> end. The Codex runner is experimental, and the Linux (bubblewrap) and Docker sandbox modes are
> implemented but not yet tested by the maintainers. See [Known limits](#known-limits).

## Try it

Needs Node 20+, `git`, the [`gh`](https://cli.github.com) CLI (logged in), and Claude Code or Codex
logged in with your own plan. No npm dependencies are installed.

```bash
npx github:serg1210/swarm init
```

```bash
npx github:serg1210/swarm doctor
```

```bash
npx github:serg1210/swarm tasks
```

```bash
npx github:serg1210/swarm run --dry-run
```

`--dry-run` does everything locally and pushes nothing, so you can read the result first. Drop it
to submit. `swarm review` verifies someone else's submission instead of writing one.

## How it works

```
   maintainers                         you                               everyone
 ┌──────────────┐   ┌────────────────────────────────────────┐   ┌─────────────────────┐
 │ task files + │   │ 1 claim     draft PR                   │   │ 5 CI      re-runs   │
 │ verify cmds  │──▶│ 2 agent     edits a fresh clone        │──▶│   verify from the   │
 │ merged to    │   │             (no shell, no web, no MCP) │   │   base branch rules │
 │ main         │   │ 3 verify    policy + sandboxed checks  │   │ 6 review  another   │
 └──────────────┘   │ 4 receipt   ed25519-signed, then PR    │   │   worker reproduces │
                    └────────────────────────────────────────┘   │ 7 merge   a human   │
                                                                 └─────────────────────┘
```

1. **Claim.** A claim is a draft pull request. GitHub hands out PR numbers in order, so the lowest
   live number wins and everyone else backs off. Stale claims expire.
2. **Agent.** The official CLI runs headlessly in a fresh clone under `~/.swarm/work`, never in
   your own repositories. With Claude Code the agent gets five tools (`Read`, `Edit`, `Write`,
   `Glob`, `Grep`) in `--restricted` mode: no shell, no web access, no MCP servers, no hooks.
3. **Verify.** Swarm checks the diff against the project's path policy, then runs the project's
   verify commands in an OS sandbox with no network, a scrubbed environment and no view of your
   home directory. If a step fails, the agent gets the output and one more attempt.
4. **Receipt.** Your local ed25519 key signs a receipt: task, base commit, tree hash, agent, usage,
   verify results. It is committed next to the work, so the ledger is just git history.
5. **CI** re-runs the policy check and the verify steps using the Swarm code and project rules from
   the *base* commit. A submission cannot bring its own verifier or its own rules.
6. **Review.** Another volunteer's `swarm review` re-checks the signature and structure, reproduces
   the verify steps in their sandbox, then has their agent read the change against the task. The
   review is signed too.
7. **Merge.** `swarm merge` refuses without the review quorum. A maintainer still decides.

## It does not eat the quota you need

- Before starting, Swarm reads your 5-hour and weekly windows from the CLI's own output. It leaves a
  reserve of **20%** of each untouched by default (`--reserve`).
- `--only-if-expiring 12` does nothing unless your weekly window resets within 12 hours. That is
  the mode to put on a timer: it only spends quota that is about to be lost.
- Each agent run has an API-equivalent spend cap (`--budget-usd`, default 3) and a wall-clock cap.
- One task per run unless you say otherwise.

## What can go wrong, and what stops it

| Risk | What Swarm does |
|---|---|
| A task tries to attack the volunteer's machine | Only task files merged by the project's maintainers are executed; issues and comments from strangers never are. The agent has no shell or network. Verify commands run sandboxed. |
| The agent "passes" by editing the tests | Task files, pinned acceptance tests, manifests, CI workflows, receipts and the verifier itself are protected paths. A task can restrict the agent to specific files. Reviewers look for weakened tests. |
| A volunteer lies about the result | Nothing from the volunteer's machine is trusted. CI recomputes the tree and diff hashes and re-runs every check from the base branch's rules. |
| Repositories get flooded with junk PRs | Maintainers opt in. One live claim per task. Nothing is pushed unless verification passed locally. |
| Review collusion | Reviews must be signed by a different key than the submission, for the exact commit. This is weak against one person with two keys, which is why a human merges. |
| Your credentials leak | Swarm never reads them. It starts the unmodified official binary and reads its JSON output. |

Passing tests and one review do not prove a change is correct. They make it cheap for a maintainer
to say yes or no.

## The two launch projects

Both live in this repository under [`.swarm/projects`](.swarm/projects).

**`core`: Swarm improves itself.** Tasks such as `swarm history`, `swarm lint`, `swarm schedule`,
brace globs and Codex quota detection, each with a pinned acceptance test. The sandbox, verifier,
signing code and runner arguments are protected: agents cannot change the trusted base.

**`gtm`: a go-to-market harness.** Marketing copy is where machine-written text does the most
damage, so it gets the same treatment as code. [`gtm/facts.json`](gtm/facts.json) is the ground
truth, editable only by maintainers. The verifier in [`gtm/checks`](gtm/checks/lib.mjs) rejects any
number that is not in the facts file, any link off the allowlist, forbidden claims, hype phrases
and off-spec structure. Agents write assets; the checks and a rubric-based review decide whether
they ship. It does not write forum posts: Hacker News asks that posts are written by people.

Planned project types, each needing its own verifier before it opens: RL environments
(API conformance plus task tests), optimized kernels (randomized correctness against a reference
plus reproduced benchmarks), and Lean proofs (a trusted statement file, no `sorry`, no new axioms).

## For maintainers

Add `.swarm/projects/<id>/project.json` and task files to your repository:

```json
{
  "name": "My project",
  "paths": ["src/**", "test/**"],
  "protect": ["package.json"],
  "verify": [{ "name": "tests", "run": "npm test", "timeoutSec": 300 }],
  "review": { "quorum": 1 }
}
```

```markdown
---
title: Add --json to the list command
size: S
paths: ["src/list.js", "test/**"]
verify: ["node --test .swarm/projects/my/tasks/list-json.test.mjs"]
---
What to build, and how you will know it is done.
```

Copy [`.github/workflows/swarm-verify.yml`](.github/workflows/swarm-verify.yml), require its status
check on your default branch and allow merge commits. Volunteers then run
`swarm run --repo you/your-repo`. More in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Commands

| | |
|---|---|
| `swarm init` | create your local signing key |
| `swarm doctor` | check tools, login and the sandbox |
| `swarm quota` | show your rate-limit windows |
| `swarm tasks` | list tasks and their state |
| `swarm run` | work on a task (`--task`, `--project`, `--max-tasks`, `--dry-run`) |
| `swarm review` | independently verify a submission |
| `swarm merge <id>` | maintainers: re-verify, check quorum, merge |
| `swarm verify` | maintainers: run verify steps on the current checkout |
| `swarm ledger` | leaderboard from merged receipts |

## Known limits

- **Not peer-to-peer.** Coordination is git and GitHub pull requests. There is no Swarm server
  either. A plain-git board (claims as compare-and-swap refs) exists for other forges and is what
  the test suite uses.
- **Linux and Docker sandboxes are untested.** On Linux without bubblewrap, Swarm refuses to run
  verify commands unless you pass `--unsafe-no-sandbox`.
- **The Codex runner is experimental**, and Swarm cannot yet read Codex quota windows.
- **The agent cannot run code.** That is deliberate, and it makes hard tasks harder. Tasks need to
  be written so they can be finished by reading.
- **Sybil resistance is thin.** Worker identity is a local key. Reputation is future work.
- **Plan terms can change.** Running the official CLI on your own machine under your own login is
  permitted today. Draining a subscription to zero on a timer is not ordinary individual use, which
  is one reason for the reserve. Swarm is not affiliated with Anthropic or OpenAI. Read your plan's
  terms.

## Prior art

Using spare subscription quota for good is not a new idea. [imbue-ai/mngr](https://github.com/imbue-ai/mngr),
[givebackai](https://github.com/orzelig/givebackai), [spare-quota](https://github.com/AFFFPupu/spare-quota)
and [prompt-for-good](https://github.com/ImsBrosLabs/prompt-for-good) all explore it. Swarm's
contribution is the pipeline around the agent: maintainer-written tasks with pinned tests, an agent
with no code execution, sandboxed verification, signed receipts, CI that trusts nothing from the
volunteer, and independent review. Relay proxies that collect subscription logins and expose them
as a shared API are a different thing, and Swarm does not do that.
[docs/RESEARCH.md](docs/RESEARCH.md) has the full survey.

## Development

```bash
npm test
```

The suite runs the whole pipeline (claim race, policy rejection, failed verification, signing,
review, merge, forged receipt) against a bare repository with a mock agent. No network, no model.

MIT licensed.
