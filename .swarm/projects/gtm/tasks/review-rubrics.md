---
title: Write per-channel review rubrics for copy
size: M
paths: ["gtm/rubrics/**"]
verify: ["node --test .swarm/projects/gtm/tasks/review-rubrics.test.mjs"]
---
## Goal

The deterministic checks catch unsupported or padded copy. They cannot judge whether copy is
clear, honest about limits, or useful to its reader. That judgement is made by the reviewing agent
during `swarm review` and by the maintainer. Give them a rubric per channel so that judgement is
consistent and auditable.

## Acceptance

- One file per channel in `gtm/channels/`: `gtm/rubrics/<channel-id>.md`.
- Each rubric has:
  - `## Reader`: who reads this asset and what they want to know (2 to 4 sentences).
  - `## Criteria`: 5 to 8 checklist items, each a line starting with `- [ ] `, each answerable yes or no
    by reading the asset next to `gtm/facts.json`. At least one criterion in every rubric must be
    about stating limitations honestly, and at least one about a reader being able to act on the asset.
  - `## Automatic reject`: 2 to 4 bullet points describing things that fail the asset outright
    (for example a claim that is not in `facts.json`, or copy written to be posted to a forum whose
    rules require human-written posts).
- Base the criteria on each channel's `purpose` in its JSON spec. Do not repeat what the
  deterministic checks already enforce (word counts, banned phrases, link allowlist).

The pinned acceptance test is `.swarm/projects/gtm/tasks/review-rubrics.test.mjs`.
