---
title: Write the one-page pitch for open-source maintainers
size: S
paths: ["gtm/assets/maintainer-pitch.md"]
---
## Goal

Write `gtm/assets/maintainer-pitch.md`: one page that a maintainer of an open-source project can
read to decide whether to let Swarm volunteers work on their repository.

The reader is tired of low-quality machine-written pull requests. They will not adopt anything that
adds review burden without a clear protection story. Address that directly.

## Rules

- Frontmatter: `channel: maintainer-pitch` and a `title`.
- Read `gtm/channels/maintainer-pitch.json` for length and required sections.
- Every factual statement must come from `gtm/facts.json`. If a fact you want is not there, leave
  it out. Do not invent numbers, adoption figures, testimonials or benchmarks.
- State the limits honestly, including that passing tests and one review do not prove a change is right.
- Plain, specific prose. `gtm/checks/lib.mjs` lists the phrases the verifier rejects.
