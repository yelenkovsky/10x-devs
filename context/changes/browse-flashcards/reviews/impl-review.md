<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Browse saved flashcards

- **Plan**: context/changes/browse-flashcards/plan.md
- **Scope**: Phases 1–3 of 3
- **Date**: 2026-09-13
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical 1 warning 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | WARNING |

## Findings

### F1 — Cap fix is uncommitted; plan still specifies the dead `.limit(1001)` probe

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: src/lib/services/list-flashcards.ts:52
- **Detail**: Working-tree `listBrowseFlashcards` uses `{ count: "exact" }`, `.limit(BROWSE_CARD_CAP)`, and `capped: count > 1000` (throws if `count === null`). That matches the prior review’s Fix A and can see a 1001st match under PostgREST `max_rows = 1000`. HEAD (`7c6addc`) still does `.limit(1001)` + slice, so `capped` stays false on the committed helper. Phase 1 of the plan still documents the probe-row algorithm. Progress 1.10 is checked on `7c6addc`, which could not have shown a real cap note. No `lessons.md` exists.
- **Fix A ⭐ Recommended**: Commit the working-tree exact-count helper and addendum Phase 1 so the contract is `{ count: "exact" }` + `.limit(1000)` + `capped: count > 1000`.
  - Strength: Lands the only honest `capped` signal under `max_rows = 1000`; plan matches code for later reviews.
  - Tradeoff: Catalog load pays for an exact count on the filtered, RLS-scoped select.
  - Confidence: HIGH — supabase-js reads `count` from `Content-Range`; empty decks return `count === 0`, not `null`.
  - Blind spot: Hosted project `max_rows` not re-checked in the dashboard (local `supabase/config.toml` and the plan both say 1000).
- **Fix B**: Revert the working tree to `.limit(1001)` and raise PostgREST `max_rows` to at least 1001 locally and hosted.
  - Strength: Restores the written Phase 1 algorithm without a count query.
  - Tradeoff: Lifts the global row ceiling (inbox included); contradicts the brief that `max_rows` stays 1000.
  - Confidence: HIGH — `max_rows` is why the probe row never arrives today.
  - Blind spot: Other PostgREST consumers inherit the higher ceiling.
- **Decision**: FIXED via Fix A

### F2 — Phase 2 and 3 manual verification still open

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/browse-flashcards/plan.md:303
- **Detail**: Automated 1.4–1.6, 2.5–2.7, and 3.4–3.6 were re-run here (`npx astro sync`, `npm run lint`, `npm run build` all passed). Phase 2 manuals 2.8–2.15 and Phase 3 manuals 3.7–3.12 remain `[ ]`. Code evidence covers guest `next` (middleware `pathname+search` + `safeReturnPath`), chips/find, empty/load/cap copy, `FlashcardItem` reuse, and Topbar mounts/`aria-current`. A human still needs to walk isolation, actions, and nav.
- **Fix**: Walk Progress 2.8–2.15 and 3.7–3.12 on a signed-in pair of users and check the boxes when they pass.
- **Decision**: FIXED via walk — remaining open: 2.8 (post-signin return), 2.12 (no 1001-row fixture), 2.14 (failed-action card error not shown), 2.15 (user B isolation)
