# Shared AI Registry Implementation Plan

## Overview

Ship `@yelenkovsky/ai-toolkit` as an isolated npm package under `packages/ai-toolkit/`, published to GitHub Packages. Consumer repos install it like any private dependency; the package's installer copies the `code-review` skill into Cursor and Claude skill dirs, sentinel-patches `AGENTS.md` / `CLAUDE.md`, and records a manifest so uninstall is exact.

## Current State Analysis

Root `package.json` is the 10xUsage Astro app. `packages/code-reviewer` already proves nested packages must stay out of npm workspaces and out of root `npm ci`. Product CI (`.github/workflows/ci.yml`) has no `packages: write` and must not gain a root `.npmrc`. This checkout is Cursor-first; the lesson install template is Claude-hardcoded. There is no `code-review` Agent Skill yet. Origin is the Cursor remote; Actions only sees `github`.

## Desired End State

- `packages/ai-toolkit/` is a publishable package: scoped name, `publishConfig.registry` = `https://npm.pkg.github.com`, `files` limited to artifacts + installer, Node `>=20` (engines may state `>=20`; workflow uses 22 to match `.nvmrc`).
- `skills/code-review/SKILL.md` reviews against **this team's** conventions (AGENTS.md / CLAUDE.md / code-reviewer criteria), with YAML frontmatter `name: code-review`.
- `rules/AGENTS.md` is a short sentinel payload (hard rules only), not a dump of CLAUDE.md.
- `install.js` / `uninstall.js` are idempotent, multi-tool, manifest-based; postinstall never fails npm and never paints the source tree.
- `.github/workflows/publish-ai-toolkit.yml` validates on PR/push (path-filtered) and publishes from `packages/ai-toolkit/` with `GITHUB_TOKEN`, skipping when the version already exists.
- Root Astro `package.json`, `ci.yml`, and `.cursor/.10x-cli-manifest.json` are untouched.

### Key Discoveries:

- ESLint ignores `packages/**` (`eslint.config.js:76`); product lint will not catch toolkit JS.
- Root Vitest will pick up `*.test.js` under `packages/` — name smokes without that suffix.
- Lesson template `npm publish` at repo root would publish `10x-astro-starter`. Must use `working-directory: packages/ai-toolkit`.
- 10x-cli already owns `<!-- BEGIN @przeprogramowani/10x-cli -->` in `.cursor/rules/10x-course.mdc`. Toolkit sentinels must use `@yelenkovsky/ai-toolkit` and only touch AGENTS.md / CLAUDE.md.
- GitHub Packages 409s duplicate versions; unfiltered `on.push` to `main` would break later product merges.

## What We're NOT Doing

- AWS CodeArtifact, Terraform, OIDC, `/tf-registry`, `/setup-cicd` (would clobber `ci.yml`).
- Model 3 API/CLI, Ed25519 signing, Circle.so entitlements.
- Adding the toolkit as a root dependency of 10xUsage (would force `GH_PKG_TOKEN` on product `npm ci`).
- npm workspaces.
- Auto-patching consumer `package.json` preinstall / rewriting consumer GitHub Actions.
- semantic-release / conventional-commit versioning automation (manual `0.1.0` is the MVP).
- Cursor Marketplace / Claude marketplace catalogs.
- Replacing `packages/code-reviewer` or installing over `10x-*` course skills.

## Implementation Approach

Three phases: (1) package metadata + artifacts, (2) installer/uninstaller, (3) publish workflow + README + local smoke. Implement against the m5l4 GitHub Packages specs with the locked names from `change.md`. Verify locally with `npm pack --dry-run` and a temp-dir install; live registry publish waits on a push to `github`.

## Critical Implementation Details

**Timing & lifecycle.** `install.js` runs as `postinstall`. When developing the source package, `npm install` inside `packages/ai-toolkit` must **no-op** unless `PROJECT_ROOT` is set or argv is `install`. Detect consumer runs by `__dirname` containing a `node_modules` path segment (walk up to that directory's parent as project root). Wrap `main()` in try/catch and `console.warn` — never `process.exit(1)` on postinstall.

**State sequencing.** Apply rules by finding both sentinel markers and replacing the inner block. If exactly one marker exists, treat as corrupted: warn and skip that file (do not append). If the rules payload contains the markers, refuse that payload. Uninstall deletes skill files from the manifest and strips sentinels; it never `rm`s `AGENTS.md` or `CLAUDE.md`.

## Phase 1: Package skeleton and artifacts

### Overview

Create the isolated package with metadata, the `code-review` skill, and the team rules payload.

### Changes Required:

#### 1. Package manifest

**File**: `packages/ai-toolkit/package.json`

**Intent**: Declare a publishable scoped package that GitHub Packages will accept and that npm will not confuse with the Astro app.

**Contract**: `name` `@yelenkovsky/ai-toolkit`; `version` `0.1.0`; `license` `UNLICENSED`; `publishConfig.registry` `https://npm.pkg.github.com`; `files` = `skills/`, `rules/`, `install.js`, `uninstall.js`, `README.md`; `scripts.postinstall` = `node install.js`; `bin.ai-toolkit` = `./install.js`; `engines.node` `>=20`; `repository` `https://github.com/yelenkovsky/10x-devs.git`. No `private: true`. No dependencies. Add a lockfile (`npm install --package-lock-only` in that directory) so `npm ci` in CI is legal.

#### 2. Code-review skill

**File**: `packages/ai-toolkit/skills/code-review/SKILL.md`

**Intent**: Give consumer Agents a portable review skill grounded in this team's stack, not generic TypeScript taste.

**Contract**: YAML frontmatter with `name: code-review` and a description matching `m5l4-shared-spec-skill.md`. Trigger phrases: review code / check this PR / review my changes / code review. Categories: Naming, Error handling, TypeScript, Function design, Security, Testing — content adapted from `AGENTS.md` / `CLAUDE.md` / `packages/code-reviewer/src/criteria.ts` (`cn()`, no `"use client"`, uppercase `GET`/`POST` + `prerender = false`, zod at API boundaries, RLS, no secrets in islands, vitest for risky paths). Findings: Critical → Warning → Suggestion with `file:line` when possible. Close with `APPROVE` | `REQUEST CHANGES` | `NEEDS DISCUSSION`.

#### 3. Team rules payload

**File**: `packages/ai-toolkit/rules/AGENTS.md`

**Intent**: Short block the installer injects between sentinels. Humans keep editing the rest of AGENTS.md / CLAUDE.md.

**Contract**: Hard-rule bullets only (cn(), no Next directives, API contract, RLS, server-only Supabase, PROTECTED_ROUTES). Must **not** contain `<!-- BEGIN` / `<!-- END`. Not a copy of full CLAUDE.md.

### Success Criteria:

#### Automated Verification:

- `test -f packages/ai-toolkit/package.json` and Node parse succeeds; `name`, `version`, `publishConfig.registry` match the contract
- `test -f packages/ai-toolkit/skills/code-review/SKILL.md`; frontmatter `name` equals `code-review`
- `test -f packages/ai-toolkit/rules/AGENTS.md`; file does not contain toolkit sentinel strings
- `npm pack --dry-run --prefix packages/ai-toolkit` succeeds and lists skill, rules, install.js, uninstall.js, README.md (README may be a stub until phase 3)

#### Manual Verification:

- Skill reads as this team's review bar (Astro/React/Supabase), not the generic conventions handout

---

## Phase 2: Idempotent installer and uninstaller

### Overview

Implement copy-mode install to Cursor and Claude paths, sentinel rules, manifests, and exact uninstall.

### Changes Required:

#### 1. Installer

**File**: `packages/ai-toolkit/install.js`

**Intent**: On consumer `npm install` (or `npx ai-toolkit install` / `PROJECT_ROOT=... node install.js`), place artifacts without duplicating or destroying human files.

**Contract**:
- Package name/version read from adjacent `package.json` (do not hardcode `0.1.0` in two places).
- Default tools: `cursor` and `claude-code`. Override with `AI_TOOLKIT_TOOLS` (comma-separated).
- Skills: copy each `skills/<name>/` to `.cursor/skills/<name>/` and `.claude/skills/<name>/`. Replace only that skill directory, not sibling skills.
- Rules: apply `rules/AGENTS.md` into consumer `AGENTS.md` and `CLAUDE.md` between `<!-- BEGIN @yelenkovsky/ai-toolkit -->` and `<!-- END @yelenkovsky/ai-toolkit -->`. Deduplicate so each file is patched once. Corrupted single-marker → warn + skip. Payload containing markers → skip rules install.
- Manifests: `.cursor/.ai-toolkit-manifest.json` and `.claude/.ai-toolkit-manifest.json` with `{ package, version, installedAt, files }` listing paths relative to project root that this tool owns (skill files for that dir). Rules files may be listed but uninstall must still not delete them.
- Skip entire install when not under `node_modules` and `PROJECT_ROOT` unset and argv is not `install`.
- `argv[2] === "uninstall"` delegates to `uninstall.js` so the `ai-toolkit` bin can uninstall.
- Errors: warn, do not throw out of postinstall.

#### 2. Uninstaller

**File**: `packages/ai-toolkit/uninstall.js`

**Intent**: Remove exactly what this package added, even if `node_modules` is already gone.

**Contract**: Read manifests from `.cursor/` and `.claude/` (PROJECT_ROOT or cwd). Delete listed skill files; skip `AGENTS.md` and `CLAUDE.md` then strip sentinel blocks from those files if present. Remove empty skill dirs and the manifest files. No-op with a log line if no manifest exists.

### Success Criteria:

#### Automated Verification:

- Smoke: `PROJECT_ROOT` = a temp dir containing a dummy AGENTS.md (human note outside sentinels) + CLAUDE.md; `node install.js install` copies `code-review` into both skill trees, wraps sentinels, writes both manifests; second run does not duplicate sentinels; human note survives
- After install, `node uninstall.js` with the same `PROJECT_ROOT` removes skill files and sentinels, leaves the human note, removes manifests
- Running `node install.js` with no `PROJECT_ROOT` from `packages/ai-toolkit` (source tree) does not create `.cursor/` or `.claude/` inside the package

#### Manual Verification:

- Open the temp AGENTS.md and confirm the human note sits outside the sentinel block after a re-install

---

## Phase 3: Publish workflow and consumer README

### Overview

Add GitHub Actions that validate and publish from the nested package, and document consumer install/auth. Live registry publish is a human push to `github`.

### Changes Required:

#### 1. Workflow

**File**: `.github/workflows/publish-ai-toolkit.yml`

**Intent**: Validate the toolkit on PRs that touch it; publish on push to `main` when the version is new.

**Contract**: `on.push` / `on.pull_request` branches `main` (also `master` if matching the spec; this repo uses `main`). Path filters: `packages/ai-toolkit/**`, `.github/workflows/publish-ai-toolkit.yml`. `permissions: contents: read` + `packages: write`. Jobs `validate` then `publish` (`if: github.event_name == 'push'`). `defaults.run.working-directory: packages/ai-toolkit`. Node 22, `registry-url: https://npm.pkg.github.com`, `scope: '@yelenkovsky'`. Validate: package.json fields, skill file + frontmatter name, `npm pack --dry-run`. Publish: `NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}`; if `npm view @yelenkovsky/ai-toolkit@version` already returns that version, skip; otherwise `npm publish`. Do not run root `npm ci`. Do not edit `ci.yml`.

#### 2. README

**File**: `packages/ai-toolkit/README.md`

**Intent**: Consumer and publisher instructions without secrets.

**Contract**: Package name, Model 1 justification (one paragraph), consumer `.npmrc` mapping-only line, local `npm login --scope=@yelenkovsky --registry=https://npm.pkg.github.com`, CI `GH_PKG_TOKEN` note, `npx ai-toolkit install` / uninstall, dual-remote reminder (`git push github`). No tokens.

### Success Criteria:

#### Automated Verification:

- Workflow YAML parses (`python -c` or `npx js-yaml` if available; otherwise `git show` + structural checks: contains `packages: write`, `working-directory: packages/ai-toolkit`, `scope: '@yelenkovsky'`, and does not contain `AWS_`)
- `npm pack --dry-run --prefix packages/ai-toolkit` includes README.md
- Product files unchanged: `git diff --name-only` does not list `package.json`, `.github/workflows/ci.yml`, `eslint.config.js`

#### Manual Verification:

- After merge + `git push github`, GitHub Actions “Publish AI Toolkit” is green and the package version appears under GitHub Packages (10xChampion screenshot: workflow, package definition, versions)

## Testing Strategy

### Unit Tests:

- None in the Astro Vitest suite. Toolkit smoke is a shell/node script invoked during phase 2 verification, not a `*.test.js` file.

### Integration Tests:

- Temp-dir install → reinstall → uninstall (phase 2 automated).
- `npm pack --dry-run` tarball contents (phases 1 and 3).

### Manual Testing Steps:

1. Read `skills/code-review/SKILL.md` and confirm it names this stack.
2. Inspect a temp-dir AGENTS.md after two installs.
3. Push to `github` when ready to publish; screenshot Packages UI for the badge.

## Performance Considerations

Installer is a small file copy. No runtime in the Astro app.

## Migration Notes

Existing `AGENTS.md` / `CLAUDE.md` gain an appended sentinel block only when a **consumer** runs install. This source repo is not a consumer; do not run install against the 10xUsage tree.

## References

- Related research: `context/changes/shared-ai-registry/research.md`
- Specs: `.cursor/prompts/m5l4-github-packages-spec-pack.md`, `.cursor/prompts/m5l4-github-packages-spec-cicd.md`, `.cursor/prompts/m5l4-shared-spec-skill.md`
- Templates: `.cursor/config-templates/m5l4-github-packages-*.template`
- Isolation pattern: `packages/code-reviewer/package.json`
- Product CI to leave alone: `.github/workflows/ci.yml`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Package skeleton and artifacts

#### Automated

- [x] 1.1 package.json parses with name, version, and publishConfig.registry matching the contract
- [x] 1.2 SKILL.md exists and frontmatter name equals code-review
- [x] 1.3 rules/AGENTS.md exists and does not contain toolkit sentinel strings
- [x] 1.4 npm pack --dry-run --prefix packages/ai-toolkit succeeds and lists required files

#### Manual

- [ ] 1.5 Skill reads as this team's review bar, not the generic conventions handout

### Phase 2: Idempotent installer and uninstaller

#### Automated

- [x] 2.1 Temp-dir install copies code-review into both skill trees, wraps sentinels, writes both manifests; second run does not duplicate sentinels; human note survives
- [x] 2.2 Uninstall removes skill files and sentinels, leaves the human note, removes manifests
- [x] 2.3 Source-tree install.js with no PROJECT_ROOT does not create .cursor/ or .claude/ inside the package

#### Manual

- [ ] 2.4 Temp AGENTS.md human note sits outside the sentinel block after a re-install

### Phase 3: Publish workflow and consumer README

#### Automated

- [x] 3.1 Workflow YAML contains packages: write, working-directory packages/ai-toolkit, scope @yelenkovsky, and no AWS_
- [x] 3.2 npm pack --dry-run includes README.md
- [x] 3.3 Product files unchanged: root package.json, ci.yml, eslint.config.js

#### Manual

- [ ] 3.4 After push to github, Publish AI Toolkit is green and the package version appears under GitHub Packages
