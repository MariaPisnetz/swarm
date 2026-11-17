---
title: Write the guide for maintainers adopting Swarm in their repository
size: S
paths: ["docs/ADOPTING.md"]
verify: ["node --test .swarm/projects/core/tasks/docs-adopting.test.mjs"]
---
## Goal

A maintainer of another open-source project should be able to read one page and add Swarm to their
repository. Write `docs/ADOPTING.md`.

Read `src/project.mjs`, `src/verify.mjs`, `src/receipt.mjs`, `.swarm/projects/core/project.json`,
`.swarm/projects/core/tasks/glob-braces.md` and `.github/workflows/swarm-verify.yml` first, and
describe what the code actually does. Do not describe features that do not exist.

## Acceptance

The guide covers, in this order, under these headings:

1. `## Before you start`: what volunteers' agents can and cannot do in your repository, and that only merged task files are executed.
2. `## Add a project`: the `.swarm/projects/<id>/project.json` manifest, with every supported key explained (`paths`, `protect`, `verify`, `limits`, `review`, `replication`, `claimTtlMinutes`, `sandbox`) and a complete example.
3. `## Write tasks`: the task file format, frontmatter keys, and how to write a task an agent without a shell can finish.
4. `## Pin acceptance tests`: how a test file in the tasks directory plus a task-level `verify` command stops an agent from grading its own work.
5. `## Set up CI`: the workflow, why it runs Swarm from the base commit, and which branch protection settings to turn on (required status check, merge commits allowed).
6. `## Review and merge`: `swarm review`, `swarm merge`, quorum.

Plain language, under 1200 words, no marketing.

The pinned acceptance test is `.swarm/projects/core/tasks/docs-adopting.test.mjs`.
