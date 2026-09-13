<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Review kept cards with a ready-made SRS

- **Plan**: context/changes/srs-review-session/plan.md
- **Scope**: Phases 1–2 of 2 (Phase 1 automated complete; Phase 2 in progress)
- **Date**: 2026-09-13
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical 1 warning 3 observations

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

### F1 — Grade UPDATE drops queue predicates

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/review-session.ts:93-98
- **Detail**: `loadQueueRow` requires `status = kept` and `due IS NULL OR due <= now`, but the following UPDATE only filters `id` + `user_id`. A concurrent Un-keep can persist FSRS onto a `generated` row (FSRS just nulled). Keep/edit do not reset FSRS, so a later Accept would resume the raced scheduler state instead of New. Two tabs that both pass `loadQueueRow` can also double-advance the same card (last write wins). Cross-user grading is still blocked by `user_id` + RLS.
- **Fix A ⭐ Recommended**: Repeat the queue filters on the UPDATE (`status = kept` and the same `due` `.or()`), then keep treating empty `.select()` as 404.
  - Strength: Closes the Un-keep window with the same predicate the plan already specified for the load; one call site.
  - Tradeoff: Two in-flight grades on the same due card can still both succeed (second `next()` applies to already-updated columns).
  - Confidence: HIGH — `loadQueueRow` already has the filters; empty select already maps to 404.
  - Blind spot: Have not exercised the race against live PostgREST.
- **Fix B**: Repeat the queue filters and also match the loaded `due`/`reps` (or equivalent) so a lost update 404s.
  - Strength: Also blocks double-grade advancing the card twice.
  - Tradeoff: More 404s under concurrency; need a stable compare set (`due` can be null on first grade).
  - Confidence: MEDIUM — correct in principle; compare-column choice is easy to get slightly wrong.
  - Blind spot: Have not checked how PostgREST encodes null `due` in an extra `.or()`/`.eq()` on UPDATE.
- **Decision**: FIXED via Fix A

### F2 — Count-then-load empty queue becomes 503

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/review-session.ts:69-80
- **Detail**: `getReviewSession` counts the due queue, then `loadNextDueRow`. If the last due card is un-kept or deleted between those calls, `parseReviewRow` sees `[]` and throws `unavailable` (503) instead of an empty session (`card: null`, `remaining: 0`, `emptyReason`).
- **Fix**: If `loadNextDueRow` is empty after a positive count, return the same empty payload as `remaining === 0` (re-count kept for `emptyReason`).
- **Decision**: FIXED

### F3 — Untracked Supabase scratch snippets

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: supabase/snippets/Untitled query 363.sql, 978.sql, 995.sql
- **Detail**: Three untracked SQL files (`set role`, JWT-claim `set_config`, one-off insert with a concrete `user_id`). Not imported by the app. `supabase/.gitignore` does not ignore `snippets/`. Committing them would add local RLS scratch and a real user UUID to the repo.
- **Fix**: Delete the snippets, or leave them untracked and do not stage them.
- **Decision**: FIXED (added `supabase/snippets/` to `supabase/.gitignore`; files are root-owned and could not be deleted)

### F4 — Phase 2 started before Phase 1 manual confirmation

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/srs-review-session/plan.md:174
- **Detail**: Phase 1 Implementation Note required a pause for human confirmation of 1.10–1.19 before Phase 2. Those manuals are still `[ ]`, while Phase 2 files exist and 2.1–2.3 are `[x]`. Not rubber-stamping — the manuals were left unchecked — but the pause was skipped.
- **Fix**: Run the Phase 1 manual checklist (or record that it was waived) before treating the slice as done.
- **Decision**: FIXED (waived in plan.md Implementation Note; Progress 1.10–1.19 left unchecked)

## Automated verification (re-run 2026-09-13)

| Check | Result |
|-------|--------|
| Migration `20260913182131_add_flashcard_fsrs.sql` exists (nullable FSRS columns + `flashcards_state_check` + `flashcards_user_id_due_kept_idx`) | PASS |
| Migration applies locally | NOT RE-VERIFIED — Docker daemon was not running |
| `ts-fsrs` is a runtime dependency (`^5.4.2`); no optimizer / NAPI / WASM siblings | PASS |
| `src/pages/api/review.ts` exports `prerender = false`, `GET`, `POST` | PASS |
| `src/types.ts` exports review session request/response types; `Flashcard` stays content-only | PASS |
| `FLASHCARD_COLUMNS` stays content-only | PASS |
| Un-keep UPDATE nulls FSRS columns with `status: "generated"` | PASS |
| `src/pages/review.astro` hydrates `ReviewSession` with `client:load` | PASS |
| `PROTECTED_ROUTES` includes `/review`; `DEFAULT_RETURN_PATH` remains `/dashboard` | PASS |
| Dashboard header links to `/review`; review header links to `/dashboard` | PASS |
| `npx astro sync` | PASS |
| `npm run lint` | PASS |
| `npm run build` | PASS |

## Manual progress

Phase 1 manuals 1.10–1.19 and Phase 2 manuals 2.7–2.12 are all `[ ]`. None are marked complete without evidence. Phase 2 automated 2.4–2.6 are still `[ ]` in Progress even though this review re-ran them successfully (impl-review does not write Progress).

## Triage

- **F1**: FIXED via Fix A
- **F2**: FIXED
- **F3**: FIXED (added `supabase/snippets/` to `supabase/.gitignore`)
- **F4**: FIXED (waived in `plan.md`; Progress left unchecked)
