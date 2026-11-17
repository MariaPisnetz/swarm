---
title: Add a readability check to the GTM verifier
size: M
paths: ["gtm/checks/**", "gtm/test/**"]
verify: ["node --test .swarm/projects/gtm/tasks/check-readability.test.mjs"]
---
## Goal

The verifier in `gtm/checks/lib.mjs` rejects unsupported numbers and hype phrases, but copy can
still be a wall of text. Add a deterministic readability check.

## Acceptance

- New export `checkReadability(asset, ctx)` in `gtm/checks/lib.mjs`, registered in `CHECKS` as
  `readability`. Like the other checks it works on `prose(asset.body)` and returns a list of problems.
- It reports:
  - any sentence longer than 40 words (quote the first six words of the sentence);
  - an average sentence length above 22 words;
  - any paragraph longer than 120 words.
- Headings, list markers and table rows are not sentences. A list item is its own unit. Sentences
  end at `.`, `?` or `!` followed by whitespace or the end of the text; do not split on the dot in
  `e.g.`, `i.e.`, version numbers such as `2.1` or file names such as `facts.json`.
- Every asset already in `gtm/assets/` must still pass. If one does not, the check is too strict or
  has a bug; do not edit assets and do not loosen the other checks.
- Tests in `gtm/test/`.

The pinned acceptance test is `.swarm/projects/gtm/tasks/check-readability.test.mjs`.
