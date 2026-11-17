# Architecture

Swarm is a single Node CLI with no npm dependencies. It shells out to `git`, `gh`, the agent CLI
and the OS sandbox. There is no server.

## Layout

```
bin/swarm.mjs            entry point
src/cli.mjs              commands, quota guard
src/worker.mjs           claim -> agent -> policy -> verify -> receipt -> submit
src/review.mjs           independent re-verification, review tally
src/project.mjs          manifests and task files (.swarm/projects/<id>/)
src/repo.mjs             local mirror, fresh work clones, rules as of a given commit
src/board/github.mjs     claims and submissions as pull requests, via gh
src/board/git.mjs        the same over plain git refs
src/runners/*.mjs        claude, codex, mock
src/sandbox.mjs          seatbelt, bubblewrap, docker           (protected)
src/verify.mjs           diff policy and verify steps           (protected)
src/receipt.mjs          receipts, reviews, structural check    (protected)
src/identity.mjs         ed25519 keys and signatures            (protected)
gtm/                     the GTM harness: facts, channels, checks, assets
```

Files marked protected cannot be changed by a Swarm contribution. Humans change them through
ordinary pull requests.

## Trust boundaries

| Component | Trusted by | Why |
|---|---|---|
| Task files and manifests on the default branch | volunteers | Merged by maintainers. Nothing else is ever turned into a prompt or a command. |
| The agent's output | nobody | It is a diff. It is policy-checked, then executed only inside the sandbox. |
| The volunteer's receipt | nobody | CI and reviewers recompute everything they can from git. |
| The Swarm code that verifies | maintainers, via CI | CI runs Swarm from the base commit, so a pull request cannot alter its own verifier. |

## A submission

```
base ── work commit ── receipt commit
```

The work commit is the agent's change. The receipt commit adds exactly one file,
`.swarm/receipts/<project>/<task>/<worker>.json`. `checkSubmission()` in `src/receipt.mjs` rejects
anything else: extra commits, a receipt whose tree hash or diff hash does not match git, a bad
signature, a task that does not exist at the base, or a diff that breaks the path policy.

A task is done when a receipt for it exists on the default branch. Task files are never edited to
close them, and the ledger is the set of merged receipts.

## Claims

**GitHub.** A claim is a draft pull request titled `[swarm] <project>/<task>: ...` holding one
empty commit. After opening it the worker lists open Swarm pull requests; if an earlier live one
exists for the same task it closes its own. Drafts older than the project's `claimTtlMinutes` are
ignored. Volunteers without push access work from a fork.

**Plain git.** A claim is `refs/swarm/claims/<project>/<task>`, created with
`git push --force-with-lease=<ref>:` (the ref must not exist) or swapped with the expired claim's
hash as the lease. The remote decides the winner atomically.

## Sandbox

`runSandboxed()` runs a shell command from the project manifest against a work directory:

- **seatbelt (macOS):** `sandbox-exec` with a profile that denies network except loopback, denies
  writes except the work directory and a private temp directory, and denies reads under the home
  directory except the work directory and the Node installation.
- **bwrap (Linux):** read-only root, tmpfs over the home directory, work directory bound
  read-write, no network namespace.
- **docker:** `--network none`, all capabilities dropped, the work directory mounted, when the
  project names an image.

In all modes the environment is replaced with a minimal one (`PATH`, a throwaway `HOME`, `TMPDIR`,
`CI=1`). In CI the throwaway runner VM is the sandbox.

## Adopting Swarm in another repository

1. Add `.swarm/projects/<id>/project.json` with `paths`, `protect`, `verify`.
2. Add task files under `.swarm/projects/<id>/tasks/`. Put a pinned acceptance test next to a task
   and name it in the task's `verify` list; the tasks directory is always protected.
3. Copy `.github/workflows/swarm-verify.yml`. It checks out this repository's Swarm code from the
   base commit; in another repository, replace that step with a checkout of a pinned Swarm release.
4. Require the `swarm-verify` status check and allow merge commits (a merge commit keeps the work
   commit, and so the receipt's hashes, in history).
