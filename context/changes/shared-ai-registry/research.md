---
date: 2026-09-14T20:33:38+00:00
researcher: yelenkovsky
git_commit: b95261913c37ee51a1680f329d2a440b58ea0ad1
branch: main
repository: yelenkovsky/10x-devs
topic: "How to ship a GitHub Packages AI toolkit from this repo without breaking the Astro app"
tags: [research, codebase, github-packages, ai-toolkit, packages, ci]
status: complete
last_updated: 2026-09-14
last_updated_by: yelenkovsky
---

# Research: How to ship a GitHub Packages AI toolkit from this repo without breaking the Astro app

**Date**: 2026-09-14T20:33:38+00:00
**Researcher**: yelenkovsky
**Git Commit**: b95261913c37ee51a1680f329d2a440b58ea0ad1
**Branch**: main
**Repository**: yelenkovsky/10x-devs

## Research Question

Where should a versioned team AI package (`@yelenkovsky/ai-toolkit`) live, how should its installer place skills and rules for this Cursor-first repo, and how can GitHub Actions publish it to GitHub Packages without colliding with the existing Cloudflare deploy pipeline?

## Summary

Model 1 (GitHub Packages) is the correct distribution model: the recipient is a GitHub-hosted account (`yelenkovsky`), CI already runs on `github.com/yelenkovsky/10x-devs`, and there is no AWS estate. Put the package at `packages/ai-toolkit/` as a **second isolated npm project** (same isolation as `packages/code-reviewer`), not at repo root and not as an npm workspace. Publish from a **new** workflow with `working-directory: packages/ai-toolkit`. The lesson install template hardcodes `.claude/` and `CLAUDE.md`; this checkout is Cursor (`tool: "cursor"`), so the installer must deliver to `.cursor/skills/` plus `.claude/skills/` (multi-tool), patch **sentinels** into `AGENTS.md` and `CLAUDE.md` (never overwrite them), and write `.ai-toolkit-manifest.json` next to each tool dir — never `.cursor/.10x-cli-manifest.json`. GitHub Actions only sees the `github` remote; Origin is ahead of GitHub as of this research (`origin/main` = `b952619`, `github/main` = `5b05e5e`).

## Detailed Findings

### Recipient and model choice

- GitHub owner is the user `yelenkovsky` (`gh repo view`). Package scope must be `@yelenkovsky`, not the lesson placeholder `@twoj-zespol`.
- Remotes: `origin` → `origin.cursor.com/yelenkovsky/10x-devs` (what local `main` tracks); `github` → `github.com/yelenkovsky/10x-devs` (Actions + deploy). Documented in `AGENTS.md:32` and `context/team/opportunity-map.md:5-15`.
- Tech stack prior: `team_size: solo`, `ci_provider: github-actions`, Cloudflare Workers — not AWS (`context/foundation/tech-stack.md`).
- Skills/rules are still copied by hand across repos (`context/team/opportunity-map.md` row “Skills/rules copied between repos by hand”). That is the pain this package addresses; the opportunity map deferred a registry, this lesson is that registry.
- Model 2 (CodeArtifact + Terraform) and Model 3 (API + CLI) exceed this audience. Ignore `/tf-registry` and `/setup-cicd` (the latter would replace `.github/workflows/ci.yml`).

### Nested packages vs root publish

- Root `package.json` is the Astro app (`name: "10x-astro-starter"`). No `workspaces`. Root `npm ci` does not install `packages/*`.
- `packages/code-reviewer` is a **private**, unscoped, local agent (`private: true`, Cursor SDK). Invoked via `npm run review:sample --prefix packages/code-reviewer`. Own lockfile. This is the isolation pattern to copy — except the toolkit **must not** be `private: true` if we want GitHub Packages to accept publish (use `publishConfig` + `UNLICENSED` instead).
- Root `tsconfig.json` excludes `packages`. `eslint.config.js:76` ignores `packages/**`. Existing `ci.yml` will not lint or typecheck the toolkit. Do not remove that ignore.
- Root Vitest include is the default `**/*.{test,spec}.*` with **no** `packages` exclude (`vitest.config.ts`). Do not name toolkit smokes `*.test.js` or local `npm test` at repo root will load them.
- `npm run format` / lint-staged Prettier **will** touch `packages/ai-toolkit/**/*.md` and `package.json`. That is fine. `install.js` is not in lint-staged globs.

### CI collision surface

- Only workflow today: `.github/workflows/ci.yml` — Node 22, `npm ci` at **root**, lint, build, deploy to Cloudflare on push to `main`. No `permissions.packages`. Triggers `main` only (not `master`).
- A second file `.github/workflows/publish-ai-toolkit.yml` does not conflict if it (1) has a distinct `name`, (2) never `npm publish`s from repo root, (3) never writes a tokenized root `.npmrc`, (4) never replaces `ci.yml`.
- Lesson starter YAML runs `npm ci` / `npm publish` at repository root. Spec itself says: if a monorepo layout exists, use `packages/ai-toolkit/`. This repo already has that layout.
- Duplicate-version 409: GitHub Packages rejects republishing the same version. Workflow must skip publish when `@yelenkovsky/ai-toolkit@<version>` already exists, or every later app merge that also triggers an unfiltered workflow will fail.
- Path filters on `packages/ai-toolkit/**` and the workflow file keep toolkit CI off the product path.

### AI artifact layout (this checkout)

- Cursor: `.cursor/skills/<name>/SKILL.md` (31 course skills), `.cursor/rules/10x-course.mdc` (already wrapped in `<!-- BEGIN @przeprogramowani/10x-cli -->`), `.cursor/prompts/`, `.cursor/config-templates/`, `.cursor/.10x-cli-manifest.json`.
- No `.claude/` tree. Root `CLAUDE.md` (long rules) and `AGENTS.md` (short guidelines pointing at `@CLAUDE.md`). Neither has toolkit sentinels today.
- **No** `code-review` Agent Skill. `packages/code-reviewer` is a Node agent that reads `AGENTS.md` via a tool — different artifact. The new skill should review against **this repo’s** hard rules (cn(), no `"use client"`, zod APIs, RLS, vitest), not generic TS taste. Align categories with `m5l4-shared-spec-skill.md` and content with `AGENTS.md` / `packages/code-reviewer/src/criteria.ts`.
- Lesson install template copies skills to `.claude/skills` and patches `CLAUDE.md`. Spec text says AGENTS.md. Implementation should honor **both** tools: copy skills to `.cursor/skills` and `.claude/skills`; sentinel-patch `AGENTS.md` and `CLAUDE.md`; write `.cursor/.ai-toolkit-manifest.json` and `.claude/.ai-toolkit-manifest.json`.
- Do not overwrite `.cursor/.10x-cli-manifest.json`, `.cursor/rules/10x-course.mdc`, or course `10x-*` skills. Do not wipe a skill directory that is not owned by this package.
- Uninstall must not delete `AGENTS.md` / `CLAUDE.md`; only strip the toolkit sentinel block. Template already skips deleting `CLAUDE.md`.

### Installer contract (from lesson specs, adapted)

- Single source of truth: files inside `packages/ai-toolkit/` (`skills/`, `rules/`, `install.js`, `uninstall.js`, `README.md`).
- Sentinels: `<!-- BEGIN @yelenkovsky/ai-toolkit -->` / `<!-- END @yelenkovsky/ai-toolkit -->`. Idempotent replace. If only one marker remains (corrupted block), warn and do not append a second copy.
- Refuse to install a rules payload that itself contains those markers.
- Manifest lists exact files installed so uninstall does not guess. Standalone of `node_modules`.
- `postinstall` must not fail `npm install` (warn on error). Skip silently when `install.js` is not running from inside `node_modules` (so `npm install` inside the source package does not paint `packages/ai-toolkit/.cursor`).
- Do not commit `_authToken`. Consumer `.npmrc` is mapping-only: `@yelenkovsky:registry=https://npm.pkg.github.com`. Document `GH_PKG_TOKEN` for foreign CI; do not auto-patch consumer `package.json` in v0.1.0 (too aggressive for this Astro app).
- Auth for **publish**: ephemeral `GITHUB_TOKEN` + `permissions: packages: write` on the new workflow. GitHub docs still describe classic PATs for local `npm login` to the npm registry; fine-grained token support remains the moving target the lesson warned about.

## Code References

- `package.json:1-17` — Astro app name/scripts; `review:agent` uses `--prefix`, not workspaces
- `packages/code-reviewer/package.json:1-8` — isolated private package pattern
- `eslint.config.js:73-76` — `ignores: ["packages/**"]`
- `tsconfig.json` — `exclude: ["dist", "packages"]`
- `.github/workflows/ci.yml:1-47` — product lint/build/deploy; no packages permission
- `AGENTS.md` / `CLAUDE.md` — human-edited rules; sentinel-patch only
- `.cursor/.10x-cli-manifest.json` — course installer inventory; do not reuse
- `.cursor/config-templates/m5l4-github-packages-*.template` — starters to adapt, not copy
- `.cursor/prompts/m5l4-github-packages-spec-pack.md` — Model 1 pack contract
- `.cursor/prompts/m5l4-github-packages-spec-cicd.md` — Model 1 workflow contract
- `packages/code-reviewer/src/criteria.ts` — stack-specific review bar to encode in `code-review` skill

## Architecture Insights

- Two worlds in one git repo: the Astro **consumer/product** at root, and nested **tooling packages** under `packages/`. Source-of-truth for AI artifacts should be the nested package; this repo is not itself a consumer of `@yelenkovsky/ai-toolkit` (adding it to root `dependencies` would make product `npm ci` need `GH_PKG_TOKEN`).
- Multi-tool delivery is an installer concern. `SKILL.md` stays tool-neutral; destination directories differ.
- Dual remotes mean a green local `main` does not publish. The publish workflow must land on `github`.

## Historical Context (from prior changes)

- `context/team/opportunity-map.md` — classified “skills copied by hand” as a later distribution problem; this change is that problem.
- `context/changes/srs-review-session` / `user-openrouter-key` — established `packages/code-reviewer` as a nested package with `--prefix` invocation; do not fold the toolkit into that agent.
- Product slices S-01–S-07 on the roadmap are `done`; this change is course/team-tooling, not a roadmap slice. Do not invent a roadmap row.

## Related Research

- None under `context/changes/**/research.md` covers GitHub Packages or skill distribution.

## Open Questions

- First publish requires pushing the workflow to `github` (user action). Local verification can stop at `npm pack --dry-run` + installer smoke against a temp dir.
- Whether to later add `@yelenkovsky/ai-toolkit` as a consumer dependency of other repos is out of this MVP; README only.
