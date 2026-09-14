# Shared AI Registry — Plan Brief

> Full plan: `context/changes/shared-ai-registry/plan.md`
> Research: `context/changes/shared-ai-registry/research.md`

## What & Why

AI skills and rules are executed code, not wiki notes. This team lives on GitHub (user `yelenkovsky`, Actions on `github.com/yelenkovsky/10x-devs`) and currently copies artifacts by hand. We publish `@yelenkovsky/ai-toolkit` to GitHub Packages so one versioned package is the source of truth.

## Starting Point

An Astro app at repo root plus an isolated `packages/code-reviewer`. No workspaces. Product CI deploys Cloudflare and must not grow a GitHub Packages `.npmrc`. Cursor-first checkout; no `.claude/` tree; no `code-review` skill.

## Decisions Locked

| Decision | Choice | Why |
|---|---|---|
| Model | 1 — GitHub Packages | Recipient is GitHub, not AWS, not gated multi-stack |
| Scope / name | `@yelenkovsky/ai-toolkit` | Packages scope must match the GitHub owner |
| Layout | `packages/ai-toolkit/` isolated (no workspaces) | Root package.json is the app; lesson allows monorepo path |
| Tools | Cursor + Claude Code dest dirs | Multi-tool requirement; this repo is Cursor |
| Rules injection | Sentinels in AGENTS.md and CLAUDE.md | Never overwrite human files |
| Versioning | Manual `0.1.0`; skip publish if version exists | Avoid GitHub Packages 409 on later main pushes |
| Not doing | CodeArtifact, replacing ci.yml, root dependency | Heavier than the audience; would break product CI |

## Phases

1. **Skeleton** — package.json, `code-review` skill, short rules payload
2. **Installer** — copy skills, sentinel rules, manifests, exact uninstall, skip source-tree postinstall
3. **Publish** — path-filtered workflow from the nested package + consumer README

## Out of Scope

Model 2/3, marketplace catalogs, semantic-release, auto-patching consumer `package.json`, installing the toolkit into 10xUsage itself.

## Verify

`npm pack --dry-run` + temp-dir install/reinstall/uninstall. Live Packages UI after `git push github` (manual / badge screenshots).
