---
title: Write the comparison with subscription relay proxies
size: S
paths: ["gtm/assets/compare-relay-proxies.md"]
---
## Goal

People who hear "use spare subscription quota" often assume Swarm is a relay proxy: a service that
collects several people's subscription logins and exposes them as a shared API. It is not. Write
`gtm/assets/compare-relay-proxies.md` explaining the difference fairly.

## Rules

- Frontmatter: `channel: comparison` and a `title`.
- Read `gtm/channels/comparison.json` for length and required sections. "Where it is stronger" must
  be honest: a relay gives interactive, general-purpose access to a model; Swarm only runs
  maintainer-written tasks and returns pull requests.
- Describe relay proxies as a category. Do not name specific projects and do not make claims about
  any provider's enforcement actions.
- Every factual statement about Swarm must come from `gtm/facts.json`.
- Do not tell readers what a provider's terms permit beyond what the `terms` fact says.
