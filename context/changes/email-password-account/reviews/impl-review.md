<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Email-password account Implementation Plan

- **Plan**: context/changes/email-password-account/plan.md
- **Scope**: Phases 1–3 of 3
- **Date**: 2026-09-13
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical 2 warnings 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — Encoded-backslash open redirect in safeReturnPath

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/auth.ts:75-88
- **Detail**: Origin check, re-serialize, leading `//`, auth-pathname reject, and the extra C0-after-`decodeURI` loop all work for the planned cases (`https://example.com`, `//evil`, `/%09//evil.com`). Node does not decode `%5C` while parsing, so `next=/%5C%5Cevil.com` (and the lowercase form) stays same-origin and is returned as-is — verified with the live helper. Chrome/IE treat a Location of `/\evil.com` as protocol-relative `//evil.com`. Unencoded `/\evil.com` is already rejected; the encoded form is the residual hole. After login, `signin.ts` / `signup.ts` 303 to that `next`. Session cookie stays first-party; this is phishing / off-site landing, not cookie theft. Live Chrome 303 of the encoded Location was not fired in this review.
- **Fix**: After `decodeURI`, reject if the decoded string contains `\` (U+005C), or normalize `\` → `/` and re-run the leading-`//` check. Do not return a serialized path that still contains `%5C`/`%5c`.
  - Strength: Closes the same class the plan already called load-bearing for tabs/newlines; one-branch change in `safeReturnPath`.
  - Tradeoff: Minor — a few lines; no product behavior change for real in-app paths.
  - Confidence: HIGH — same bypass class is documented across redirect helpers; planned payloads already default correctly.
  - Blind spot: Did not confirm a live 303 `Location: /%5C%5Cevil.com` is followed off-origin in current Chrome (Node WHATWG keeps that string same-origin).
- **Decision**: FIXED

### F2 — Unplanned ESLint disable for every .astro file

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Scope Discipline
- **Location**: eslint.config.js:65-66
- **Detail**: Phase 3 added `"@typescript-eslint/no-misused-promises": "off"` for all `**/*.astro` because `astro-eslint-parser` crashes on `return Astro.redirect(...)`. That unblocks the planned signed-in redirects on `signin.astro` / `signup.astro` / `confirm-email.astro`, but the override is broader than those pages and was not in Changes Required. Commit `191360c` also bundled unrelated `.cursor/` skill/rule files with the auth work (commit hygiene, not product scope).
- **Fix A ⭐ Recommended**: Document the override in a plan addendum and keep it on `**/*.astro` with the existing crash comment
  - Strength: The parser crash is on the construct, not the path — the next S-01 page that `return Astro.redirect(...)` will hit the same failure.
  - Tradeoff: The rule stays off for every Astro file, including ones that never redirect.
  - Confidence: HIGH — lint is green today only because of this override; the comment already names the crash.
  - Blind spot: Have not checked whether a newer `eslint-plugin-astro` / parser release fixes the crash.
- **Fix B**: Narrow the override to `src/pages/auth/*.astro`
  - Strength: Smaller blast radius; matches the pages that actually return redirects today.
  - Tradeoff: The next frontmatter `Astro.redirect` outside that glob re-breaks lint.
  - Confidence: MEDIUM — depends how soon S-01 adds protected-page redirects.
  - Blind spot: Other `.astro` files were not re-linted with the rule left on.
- **Decision**: FIXED (Fix A)

### F3 — requireUser treats undefined as authenticated

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/auth.ts:117-118
- **Detail**: `if (locals.user !== null) return null` only 401s on `null`. `App.Locals.user` is typed `User | null` and middleware always assigns, so this is not hit today. If middleware is skipped or a test stub omits `user`, future S-01 JSON writes would be allowed.
- **Fix**: Use `if (!locals.user)` so `undefined` and `null` both 401.
- **Decision**: FIXED
