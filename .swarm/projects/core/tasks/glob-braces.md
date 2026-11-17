---
title: Support {a,b} alternation in path globs
size: S
paths: ["src/util.mjs", "test/**"]
verify: ["node --test .swarm/projects/core/tasks/glob-braces.test.mjs"]
---
## Goal

Project manifests list path globs in `paths` and `protect`. Today `globToRegExp` in `src/util.mjs`
supports `*`, `**` and `?`. Maintainers also want brace alternation, for example
`src/{cli,worker}.mjs` or `**/*.{md,txt}`.

## Acceptance

- `globToRegExp('src/{cli,worker}.mjs')` matches `src/cli.mjs` and `src/worker.mjs` and nothing else.
- Alternatives may contain `*` and `**`; they may not be nested (treat a nested `{` literally).
- A `{` with no closing `}` is a literal character.
- Existing behaviour is unchanged; every existing test still passes.
- Add a few cases to `test/unit.test.mjs`.

The pinned acceptance test is `.swarm/projects/core/tasks/glob-braces.test.mjs`. You cannot change it.
