<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: User OpenRouter API Key Implementation Plan

- **Plan**: context/changes/user-openrouter-key/plan.md
- **Scope**: Phases 1–3 of 3 (automated complete; manuals still open)
- **Date**: 2026-09-13
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical 2 warnings 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — Decrypt and hint reads omit an explicit user_id filter

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/openrouter-key.ts:73, src/lib/services/openrouter-key.ts:99
- **Detail**: Plan said generate loads that `userId`’s row. `loadOpenRouterKeyHint` and `loadDecryptedOpenRouterApiKey` use `.select(…).maybeSingle()` with no `.eq("user_id", …)`. Save/delete and browse/mutate flashcards filter by `userId`. Isolation then depends on RLS plus the cookie JWT client. If RLS were off or the client were service-role, `maybeSingle()` on a table with a single row would return another account’s last-4 or ciphertext. The in-memory test store already scopes `maybeSingle()` by `clientFor(userId)`, so tests would still pass without the filter.
- **Fix**: Thread `userId` (from `locals.user.id` / `generateCards` input) into both loaders and add `.eq("user_id", userId)` before `maybeSingle()`.
- **Decision**: FIXED

### F2 — Dashboard treats a hint-load failure as “no key”

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/dashboard.astro:20
- **Detail**: A thrown `loadOpenRouterKeyHint` sets `configured = false`. `PasteGenerate` then disables Generate and shows “Add your OpenRouter API key in Settings.” Settings uses the same loader but surfaces `loadError`. A transient DB error hides a saved key and sends the learner to the wrong recovery path, even though `POST /api/cards/generate` could still decrypt and run.
- **Fix A ⭐ Recommended**: Pass a distinct load-error into `PasteGenerate` (reuse the settings `loadError` pattern) and do not show the “add your key” CTA when status is unknown.
  - Strength: Matches Settings; keeps the disabled-Generate gate honest.
  - Tradeoff: Island gains an extra error state beyond `configured`.
  - Confidence: HIGH — settings.astro already implements this split.
  - Blind spot: Have not walked the copy for a combined cards+key load failure.
- **Fix B**: Leave Generate enabled when the hint load fails and let the generate API return `generation_not_configured` / `generation_unavailable`.
  - Strength: Avoids a false “no key” gate; one less SSR branch.
  - Tradeoff: Learner can click Generate during an outage and hit a 503 instead of a settings CTA.
  - Confidence: MEDIUM — works, but fights the Phase 3 “disable until configured” UX.
  - Blind spot: Unclear how often hint load fails independently of generate.
- **Decision**: FIXED (Fix A)

### F3 — DELETE skips the planned USER_SECRETS_KEY 503

- **Severity**: 📝 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/pages/api/settings/openrouter-key.ts:63
- **Detail**: Phase 2 said missing Supabase or `USER_SECRETS_KEY` → 503 on this API. POST checks the wrapping key; DELETE only checks Supabase. Delete does not encrypt, so the skip is safer for a learner stuck with unreadable ciphertext when the operator secret is missing.
- **Fix**: Document the DELETE exception in the plan. Do not add a wrapping-key 503 on DELETE.
- **Decision**: FIXED

### F4 — Rejected-key generate test does not assert the row stays

- **Severity**: 📝 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: src/lib/services/generate-cards.test.ts:103
- **Detail**: Implementation does not delete on OpenRouter 401/403. The test only asserts `generation_invalid_key` and no flashcard insert — which matches the written success criterion. A later auto-delete (explicitly out of scope) would still pass.
- **Fix**: After the reject, assert `store.rows.get(USER_A)` is still present.
- **Decision**: FIXED
