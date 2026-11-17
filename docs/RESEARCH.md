# Research: what exists, what we reuse, what we build

Surveyed on 2026-11-17. Star counts and dates are from the GitHub API on that day. Items marked
*unverified* could not be confirmed from a primary source.

## 1. Who else is doing this

Swarm is not the first project to spend spare subscription quota on open-source work. None of the
existing ones has a verification pipeline or meaningful adoption.

| Project | Stars | What it does | What we took |
|---|---|---|---|
| [imbue-ai/mngr](https://github.com/imbue-ai/mngr) | 431 | Cron checks usage and launches a Claude skill when quota is spare. No task board. | The idea of pacing against the reset time |
| [orzelig/givebackai](https://github.com/orzelig/givebackai) | 0 | Paste a prompt into Claude Code; partner repos opt in with a label; PR under your GitHub. | Maintainer opt-in |
| [ImsBrosLabs/prompt-for-good](https://github.com/ImsBrosLabs/prompt-for-good) | 1 | Hub with issue queue, claims and scoring, plus a Docker runner. Uses API credits. | Nothing directly |
| [AFFFPupu/spare-quota](https://github.com/AFFFPupu/spare-quota) | 0 | Reads Claude and Codex quota without credentials; finds labelled issues. | Where Codex stores rate limits |
| [autoresearch-at-home](https://github.com/mutable-state-inc/autoresearch-at-home) | 497 | SETI@home-style fork of autoresearch. Donates GPU time, not quota. Dormant. | Claims with expiry |
| [claude-relay-service](https://github.com/Wei-Shaw/claude-relay-service), [CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI) | 12.8k, 58.8k | Pool subscription logins and expose them as an API. | Nothing. This is the pattern Swarm avoids. |

## 2. Plan terms

- Anthropic's help centre says the Agent SDK and `claude -p` "still draw from your subscription
  limits", so headless use on a plan is allowed today. A move to separate credits was announced in
  May 2026 and paused in June; it could return.
- Anthropic's legal page says limits "assume ordinary, individual usage", and that third parties may
  not route requests through plan credentials on behalf of users or collect those credentials.
  Signing in to the unmodified Claude Code binary with your own subscription is fine.
- OpenAI's terms forbid sharing account credentials. Its docs recommend API keys for automation and
  warn against exposing Codex execution in untrusted or public environments.

**What this means for the design**

| | |
|---|---|
| Clearly fine | Own machine, own login, unmodified official CLI, tokens never leave, PR under the volunteer's GitHub account |
| Grey | Unattended runs on tasks chosen by a third-party board; draining quota to 100% |
| Prohibited | Relaying or pooling tokens, hosting volunteers' logins, paying for quota, modified binaries |

So Swarm keeps a reserve by default, only runs when the volunteer starts it (or installs their own
timer), shows the task before working on it, and never touches credentials. We describe it as
volunteer computing, not pooling.

## 3. Quota mechanics

- Claude Pro and Max have a 5-hour window and a weekly window, shared with claude.ai.
- `claude -p --output-format stream-json` emits a `rate_limit_event`. On Claude Code 2.1.326 we
  observed `rate_limit_info.unifiedWindows.{five_hour,seven_day}.{utilization,resetsAt,status}`.
  These fields are not documented and may be absent, so the guard treats missing values as unknown.
- `codex exec --json` carries token usage on `turn.completed` but no rate limits. Those are written
  to session rollouts under `~/.codex/sessions` (*unverified by us*; see task `core/codex-quota`).
- "$50 a week of unused quota per developer" is **not supported by public data**. The one measured
  figure we found is a single user's estimate of a full Max 5x week at about $523 in API-equivalent
  dollars. Ten percent of that going unused is plausible for a Max subscriber, unproven as an
  average. Swarm reports API-equivalent cost per run, as computed by the CLI, and makes no claim
  about averages.

## 4. Build or reuse

| Piece | Candidates | Decision |
|---|---|---|
| Agent execution | Claude Code `-p`, Codex `exec`; OpenHands and SWE-agent (own runtimes, API keys) | **Reuse the official CLIs.** They are the only way to use plan quota within terms. We wrote a JSON stream parser for each. |
| Orchestration | vibe-kanban (28.7k), Gas Town (18.8k), ruflo (82k), OpenAI Symphony (28.1k), claude-squad (AGPL) | **Build.** All are large local multi-agent apps for one user's backlog. Ours is about 300 lines and has to be auditable by someone about to run it. We borrowed "fresh workspace per task". |
| Agent safety | github/gh-aw "safe outputs": the agent is read-only and a wrapper applies writes | **Borrow the idea.** Our agent can edit files but cannot execute anything; Swarm does the pushing. |
| Verify sandbox | Anthropic sandbox-runtime (`srt`, 7.2k, beta), container-use (Docker MCP server), built-in CLI sandboxes | **Build a thin wrapper** over macOS `sandbox-exec` and Linux `bwrap`, the same OS mechanisms those tools use, plus a Docker mode. About 120 lines, no dependency. `srt` as an optional backend is a good future task. |
| Quota detection | ccusage (19.5k) estimates cost from local logs, not plan percentage | **Build.** The CLI already reports the windows in its output. |
| Claims | Issue comments or assignment; git ref locks | **Build two.** Draft PRs on GitHub (ordered, visible, no write access needed); compare-and-swap refs on plain git. |
| Provenance | sigstore-js (needs OIDC, awkward on laptops), gitsign (GitHub shows unverified), SSH commit signing, GitHub artifact attestations | **Build ed25519 receipts** with `node:crypto` for day one. Attesting the CI verdict with GitHub artifact attestations is a planned addition. |
| Redundancy | BOINC quorum and adaptive replication | **Borrow later.** `replication` and `review.quorum` exist in the manifest; reputation-weighted sampling is future work. |
| P2P transport | js-libp2p, iroh 1.0, Hyperswarm, Nostr, Radicle | **None.** GitHub already provides identity, ordering, CI and review. If a transport is ever needed, iroh is the candidate. |
| GTM generation | marketingskills (61k), knowledge-work-plugins (36.4k) | Usable as prompt material for asset tasks. |
| GTM verification | promptfoo `llm-rubric`, deepeval, humanizer and stop-slop phrase lists | **Build the deterministic layer** (facts file, number and link allowlists, phrase lint). No open-source verifier for marketing claims existed. Rubric judging happens in `swarm review`. |
| Future verifiers | Lean `lake` comparator and axiom checks, Gymnasium `check_env`, PettingZoo `api_test`, KernelBench | Reuse when those project types open. |

## 5. Launch notes

- Show HN wants something people can try without signing up, and asks that posts and comments are
  not generated text. A person writes the post. `gtm/assets/hn-factsheet.md` is source material only.
- Titles that worked for comparable tools follow "Show HN: Name – plain description".
  Volunteer-computing launches we found scored low; agent-tool launches did well when they led with
  how they keep agents from wrecking a codebase.
- Expect these objections: garbage output, review becoming the bottleneck, fake reviewers,
  maintainers who do not want machine-written PRs, and plan terms. `gtm/assets/faq.md` answers each.
