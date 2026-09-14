<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Ground generate in paste Implementation Plan

- **Plan**: context/changes/ground-generate-in-paste/plan.md
- **Scope**: Phases 1–2 of 2 (Phase 2 manual 2.7–2.9 still pending)
- **Date**: 2026-09-14
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical 2 warnings 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — Unmatched-paste status is gated on an empty deck, not this batch

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: src/components/cards/PasteGenerate.tsx:141
- **Detail**: Plan contract is a `200` with response `cards.length === 0` and `failedCount > 0` → unmatched-paste `role="status"`, and do not also show the generic “N could not be saved” line. Implementation computes `unmatchedPaste = cards.length === 0 && (batchNotes?.failedCount ?? 0) > 0` after prepend, so `cards` is the island deck. Empty dashboard + 0 grounded cards matches. A nonempty deck + the same 200 shows “N cards from this batch could not be saved.” instead of “None of the cards matched this paste.” Island tests only render `initialCards={[]}`.
- **Fix A ⭐ Recommended**: Gate unmatched on this-batch result (`parsed.data.cards.length === 0 && failedCount > 0`), keep that flag in state, and add a nonempty-deck test
  - Strength: Matches the 200-body contract and the “do not show generic failedCount in that same case” rule even after the first generate.
  - Tradeoff: One extra piece of batch state; empty-deck copy still stays hidden only when unmatched is true (already true today on an empty deck).
  - Confidence: HIGH — prepend already uses `parsed.data.cards`; the island just needs that length, not deck length.
  - Blind spot: Did not click a live unmatched generate on a nonempty dashboard.
- **Fix B**: Keep deck-gated unmatched and addendum the plan to “empty deck only”
  - Strength: Covers the framed empty-dashboard bug with no code change.
  - Tradeoff: A later unmatched generate on an existing inbox looks like a partial save failure, not “none matched this paste.”
  - Confidence: MEDIUM — framed observation was an empty deck; the written Phase 2 contract is still the response body.
  - Blind spot: Whether learners commonly generate again with cards already on screen (likely yes after the first batch).
- **Decision**: FIXED (Fix A)

### F2 — Mid-string `•` splits like `/`, not only as a bullet prefix

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/lib/services/paste-targets.ts:45
- **Detail**: Plan: split on newlines, `/`, and bullet prefixes (`-`, `*`, `•`). `-` and `*` are prefix-only (`/^\s*[-*•]\s+/`). `•` is also in `split(/[/•]/)`, so `apple•banana` becomes a 2-item list while `apple-banana` stays one chunk. Prefix stripping for `• cherry` still works.
- **Fix A ⭐ Recommended**: Drop `•` from the slash split; keep it only on the bullet-prefix regex
  - Strength: Matches the plan; `-`/`*`/`•` stay the same class.
  - Tradeoff: Inline `apple • banana • cherry` (no newlines) stays prose unless commas apply.
  - Confidence: HIGH — one character class change plus a unit test.
  - Blind spot: Did not survey real learner pastes for mid-line `•` lists.
- **Fix B**: Keep mid-string `•` as a list delimiter and note it in the plan
  - Strength: Treats a common bullet glyph like `/` without requiring newlines.
  - Tradeoff: `word•phrase` compounds split; `-`/`*` do not, so delimiters are inconsistent.
  - Confidence: MEDIUM — helpful for some pastes, not what Phase 1.1 specified.
  - Blind spot: No production paste corpus in-repo.
- **Decision**: FIXED (Fix A)

### F3 — Progress SHAs are not on current `main`

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/ground-generate-in-paste/plan.md:224-244
- **Detail**: Progress stamps Phase 1 as `231d89e` and Phase 2 as `7928bbc`. Those objects exist with the same messages as `650b0d1` / `e760886` but are not ancestors of `HEAD` (`82fa95a` on `main`). Status tools that resolve SHAs on the current branch will miss the implementation commits.
- **Fix**: Restamp Progress to `650b0d1` (Phase 1) and `e760886` (Phase 2), the commits on `main`.
- **Decision**: FIXED

### F4 — List `minItems` / fail-closed 400 is untested

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: src/lib/services/generate-cards.ts:90-92,213-215
- **Detail**: Code sets `minItems = maxItems = cappedItemCount` for lists and maps any non-OK OpenRouter status (including 400) to `generation_unavailable` with no retry that strips `minItems`. Named 1.3 tests lock persist, `truncated`, and the 15-line user message; they do not assert the schema bounds or a 400 → single fetch + unavailable. A later silent omit-and-retry would still pass.
- **Fix**: Add one list-schema assertion (`minItems`/`maxItems` = 3 for a 3-item paste) and one 400 stub that expects a single fetch and `generation_unavailable`.
- **Decision**: FIXED
