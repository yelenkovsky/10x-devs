---
change_id: shared-ai-registry
title: Versioned team AI toolkit on GitHub Packages
status: implementing
created: 2026-09-14
updated: 2026-09-14
archived_at: null
---

## Notes

Recipient is a GitHub-hosted team (user `yelenkovsky`, remotes `github.com/yelenkovsky/10x-devs` + Cursor Origin, GitHub Actions CI). Model 1 (GitHub Packages) is the fit: one `publishConfig` field, no AWS account, no Terraform, no API+CLI product. Model 2 is heavier than this audience needs; Model 3 is for gated multi-stack recipients, not us.

Do not copy lesson templates 1:1. Lock: scope `@yelenkovsky`, package `@yelenkovsky/ai-toolkit` at `packages/ai-toolkit/` (root `package.json` is the Astro app), artifact range = `code-review` skill + team rules, readiness = validate + publish workflow + idempotent install/uninstall with sentinels and a manifest.
