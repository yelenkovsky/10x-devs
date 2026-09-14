---
name: code-review
description: Review code changes against team engineering conventions, testing standards and security expectations.
---

# Code review

Use this skill when asked to review code, check a PR, review changes, or run a code review.

Review against **this team's** 10xUsage stack (Astro 6 SSR, React 19 islands, Tailwind 4, Supabase cookie auth, Cloudflare Workers). Do not invent a parallel standard. Prefer `AGENTS.md` / `CLAUDE.md` in the consumer repo, and the rules block injected by `@yelenkovsky/ai-toolkit`, over generic TypeScript taste.

## How to review

1. Read the diff (and the nearest existing files for idiom).
2. Check every category below.
3. Report findings by severity: **Critical** → **Warning** → **Suggestion**.
4. Each finding includes a `file:line` reference when possible, what is wrong, and a concrete fix.
5. Finish with one recommendation: `APPROVE`, `REQUEST CHANGES`, or `NEEDS DISCUSSION`.

**Verdict rule:** any Critical finding (authz leak, secret in a client island, XSS, broken API contract, another user's cards becoming visible) → `REQUEST CHANGES`. Mixed Warnings with no Critical → `NEEDS DISCUSSION` unless they are trivial. Clean or Suggestions-only → `APPROVE`.

## Categories

### Naming

- Variables and functions: descriptive camelCase. Booleans: `is` / `has` / `should` / `can`. Functions: verb-first.
- Files match the primary export (`UserService.ts` exports `UserService`).
- Constants: `UPPER_SNAKE_CASE`.

### Error handling

- Async work uses try/catch or `.catch()`. No empty catch blocks.
- Error messages name the operation and the relevant inputs.
- HTTP errors include a status code and an actionable message; never leak stack traces or internal paths to the client.
- Cleanup of opened resources belongs in `finally`.

### TypeScript

- No `any` without an explicit justification comment. Prefer `unknown` at system boundaries, then narrow.
- Prefer `interface` for object shapes. Model states with discriminated unions, not a pile of optional fields.
- Generic params are descriptive (`TUser`, not `T`).

### Function design

- Single responsibility. Max three parameters; beyond that an options object.
- Early returns over nested conditionals.
- Query helpers (`get*`, `find*`, `is*`) stay pure.

### Security

- Secrets only from the environment / `astro:env/server`. Never `SUPABASE_*` or API keys in React islands, query strings, or client bundles.
- Validate untrusted input with zod at API route boundaries.
- Session user (`locals.user.id`) is the only owner key. No client-chosen `user_id`.
- SQL is parameterized. New tables have RLS with per-operation, per-role policies.
- No `dangerouslySetInnerHTML` / unsanitized HTML from paste or model output.

### Testing

- Test names describe behavior ("returns empty array when no results found").
- Each test owns setup and teardown. Assert specific values, not `toBeTruthy()`.
- Cover empty, null, boundary, and error paths.
- Risky product paths (auth, card writes, generation, SRS review) need vitest coverage in proportion to blast radius.

## Stack-specific checks (10xUsage)

These are as binding as the categories above when the consumer is this codebase:

- Tailwind: `cn()` from `@/lib/utils`, never string-concatenated class names.
- No Next.js directives (`"use client"`). Hooks live in `src/components/hooks/`.
- API routes: `export const prerender = false`, uppercase `GET`/`POST`.
- Astro for static/layout; React only for interactivity. No `ReactDOM.render`, `findDOMNode`, or function-component `defaultProps`.
- Authenticated HTML routes join `PROTECTED_ROUTES`. JSON writes call `requireUser` (401), not an HTML redirect.
- Cards and pastes never leak across accounts.

## Output template

```markdown
## Code review

### Critical
- `path:line` — …

### Warning
- `path:line` — …

### Suggestion
- `path:line` — …

**Recommendation:** APPROVE | REQUEST CHANGES | NEEDS DISCUSSION
```
