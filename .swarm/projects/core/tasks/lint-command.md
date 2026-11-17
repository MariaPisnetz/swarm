---
title: Add `swarm lint` to validate project manifests and task files
size: M
paths: ["src/lint.mjs", "src/cli.mjs", "test/**"]
verify: ["node --test .swarm/projects/core/tasks/lint-command.test.mjs"]
---
## Goal

A maintainer who mistypes a manifest key or forgets a task title finds out only when a volunteer's
run fails. Add `swarm lint`, which checks `.swarm/projects/*` in the current directory and exits
non-zero when it finds problems.

## Acceptance

- New module `src/lint.mjs` exporting `lintRepo(root)`, which returns an array of
  `{ file, problem }` (empty when everything is fine). It must not throw on bad input; a manifest
  that is not valid JSON is itself a reported problem.
- Checks, at minimum:
  - `project.json`: unknown top-level keys (known: `name`, `description`, `paths`, `protect`,
    `verify`, `limits`, `review`, `replication`, `claimTtlMinutes`, `sandbox`); `verify` entries
    missing `name` or `run`; a project with no verify steps.
  - task files: missing `title`; an id (frontmatter `id` or the file name) that is not lowercase
    letters, digits and dashes; a `status` other than `ready`, `blocked` or `draft`; an empty body;
    a `verify` command that references a file under `.swarm/projects/` which does not exist.
- `swarm lint` prints one line per problem and sets exit code 1 if there are any; prints a
  one-line OK otherwise. Add it to the help text under Maintainer.
- This repository's own `.swarm/` must lint clean.

The pinned acceptance test is `.swarm/projects/core/tasks/lint-command.test.mjs`.
