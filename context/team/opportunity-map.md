# Opportunity Map

## Context

- **Project / context**: 10xUsage / 10xdevs — Cursor Origin is the primary remote (`origin` → `origin.cursor.com/yelenkovsky/10x-devs`); GitHub (`github` → `github.com/yelenkovsky/10x-devs`) is the CI/deploy remote. Linear is used for tickets. Skills and AI rules are copied across repos by hand.
- **Data constraint**: Mock / local / read-only / non-sensitive. First versions stay lightweight — no access-control or audit work up front.
- **Date**: 2026-09-14

## Map

One row per signal, terse cells (a phrase each) — longer reasoning belongs in the sections below:

| Signal | Existing / default response | Thin complement | First useful version | Data risk | Direction if valuable |
|---|---|---|---|---|---|
| Origin ahead of GitHub, unnoticed | Dual remotes; Actions only sees `github` | SHA/ref compare across remotes | Local fetch + commit digest | local / read-only | Internal tool → async check |
| Linear + GitHub updated by hand | Linear GitHub app, PR ↔ issue links | Unmatched ticket/PR list | CSV/mock join of issues vs PRs | mock / local | Try Linear native; else Wait |
| Skills/rules copied between repos by hand | Per-repo + personal skills, copy-paste | Cross-repo file inventory | Checksum/diff of SKILL.md / AGENTS.md / rules | local / non-sensitive | Internal tool → artifact registry |

## Recommended First Candidate

```text
Candidate:
Origin–GitHub drift digest

Reads:
Local remotes `origin` (origin.cursor.com) and `github` (github.com/yelenkovsky/10x-devs), or recorded SHAs if fetch is unavailable

Returns:
A short report: watched branches, tip SHAs, commits on Origin not on GitHub (and the reverse), so CI/deploy lag is visible

Does not do:
Auto-push, webhooks, Slack, Linear writes, becoming the system of record

Data risk:
local / read-only / non-sensitive

Direction if it proves valuable:
Internal tool → Async / remote work (scheduled check). A Review / CI gate only if the digest earns a regular user.
```

## Why This Candidate

The dual-remote setup is a real constraint; the silent lag is accidental. GitHub is what Actions deploys from, so unnoticed Origin-ahead commits are already operational pain. The digest joins two sources, stays read-only and throwaway, and does not replace Origin or GitHub.

Linear ↔ GitHub status is a SaaS default (Linear’s GitHub integration) until Origin-shaped friction is confirmed — if work lives on Origin and GitHub is only a CI mirror, native Linear-on-GitHub cannot see the real work. The skills inventory is real, but a shared artifact registry is a later distribution problem, not the first useful version.

## Next Direction If Valuable

Internal tool, then async / remote work: a scheduled read-only drift check once a person actually uses the local digest. Do not auto-sync remotes, stand up a dashboard, or encode this as a CI gate until the digest has a regular user.

Chosen path after the map: validate with `/10x-mom-test`, then `/10x-shape` if the problem survives.
