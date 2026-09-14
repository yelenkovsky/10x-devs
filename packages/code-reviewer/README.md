# code-reviewer

Independent local review agent for this repo. It uses the Cursor SDK to score a git diff against five 10xUsage criteria and print JSON. It is not part of the Astro app.

## Criteria (1–10)

These are the merge bar the agent is instructed to apply — stack rules from `AGENTS.md`, not generic TypeScript taste:

1. **implementationCorrectness** — Astro `GET`/`POST`, `prerender = false`, Zod bodies, `locals.user.id` (not a client `userId`).
2. **idiomaticity** — no `"use client"`, merge classes with `cn()`, React islands only when interactive, services under `src/lib/services/`.
3. **complexity** — simplest design that solves the problem.
4. **testRiskCoverage** — vitest on auth, card writes, generation, and SRS paths in proportion to leak/loss risk.
5. **securitySafety** — server-only secrets, session-bound rows, no XSS / unsanitized HTML.

Verdict is `fail` when any score is ≤ 4, `securitySafety` is ≤ 5, or the diff introduces XSS, secret leakage, broken authz, or a React 19-incompatible API used as if it still worked.

The agent may call two read-only tools before scoring: `readPlan` (`context/changes/<id>/plan.md`) and `readConventions` (`AGENTS.md`).

## Setup

```bash
cd packages/code-reviewer
npm install
cp .env.example .env
```

Put a Cursor user or service-account API key from [Cursor Dashboard → Integrations](https://cursor.com/dashboard/integrations) into `.env` as `CURSOR_API_KEY`. For model evals, also set `OPENROUTER_API_KEY`.

## Run

Fixture diff (same command from this directory or the repo root):

```bash
npm run review:agent
npm run review:sample
```

Current uncommitted repo diff (run from any git worktree path):

```bash
git diff | npx tsx src/index.ts
```

Stdout is the review JSON. Stderr is status plus token/cost metrics.

## Evals

The same prompt is scored on three OpenRouter models against `fixtures/react19-migration.diff` (a React 16 → 19 preview migration with three load-bearing defects). Assertions: JSON matches the review schema, verdict is `fail`, and an LLM-as-judge checks that defaultProps, `dangerouslySetInnerHTML`, and `findDOMNode` were named.

```bash
npm run eval
```

CI uses the same prompt via OpenRouter (`REVIEW_PROVIDER=openrouter`) from `.github/workflows/review.yml`. Every pull request to `main` gets a summary comment and an `ai-cr:passed` or `ai-cr:failed` label. Add `ai-cr:review` to retry.

Known-bad files under `fixtures/` are the eval corpus. CI and `git diff | npx tsx src/index.ts` drop those hunks (and lockfiles) before scoring so a reviewer PR is not failed for shipping the sample. `--sample` and `npm run eval` still score the corpus as-is.
