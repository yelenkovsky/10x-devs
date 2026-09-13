<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Paste and generate typical-use cloze cards

- **Plan**: context/changes/paste-generate-typical-use/plan.md
- **Scope**: Phase 3 of 3 (full plan; all Progress items `[x]`)
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

### F1 — Dashboard load treats select failures as an empty deck

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/list-flashcards.ts:59
- **Detail**: On a Supabase `error`, `listFlashcards` returns `[]`. Non-array payloads and rows that fail zod are also dropped silently. `dashboard.astro` passes that list into `PasteGenerate`, which renders the first-visit copy (“No cards yet…”). A refresh after a successful generate can look like data loss. The write path (`generate-cards.ts`) throws on insert failure; the read path does not.
- **Fix A ⭐ Recommended**: Propagate the select failure and show a load-error state on the dashboard
  - Strength: Distinguishes “no cards yet” from “could not load”; matches the generate path’s fail-closed habit.
  - Tradeoff: Needs a small island/SSR contract for an error flag and copy.
  - Confidence: HIGH — the empty-state string is already the only read of `cards.length === 0`.
  - Blind spot: Have not reproduced a live select failure against local Supabase.
- **Fix B**: Keep `[]` on error, but render distinct error copy
  - Strength: Narrower UI change; still avoids the false empty-account message.
  - Tradeoff: Callers cannot tell empty from failed without a side channel; easy to regress.
  - Confidence: MEDIUM — still fail-open for the data, only the copy changes.
  - Blind spot: Future list callers (S-06 browse) would inherit the same swallow unless the helper changes.
- **Decision**: FIXED via Fix A

### F2 — Unplanned auth change left sign-in islands unhydrated

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Scope Discipline
- **Location**: src/pages/auth/signin.astro:36
- **Detail**: Commit `89144c4` is not in the plan. It drops `client:load` on `SignInForm` / `SignUpForm` so the island cannot unmount and hide the form. Native POST still works, but React handlers never attach: password toggle, client validation (`noValidate` + `onSubmit`), and `useFormStatus` pending text stay inert. The generate slice depends on this signed-in path. The working tree already has an untracked `PasswordVisibilityScript.astro` follow-up — not part of the reviewed commits.
- **Fix A ⭐ Recommended**: Restore `client:load` and fix the actual unmount
  - Strength: Keeps the existing React island (toggle, validation, pending) and matches S-02’s `client:load` pattern.
  - Tradeoff: Must find and fix the hydration unmount instead of avoiding hydration.
  - Confidence: MEDIUM — the commit message names the symptom; the root cause is not in this diff.
  - Blind spot: Have not reproduced the unmount in the browser.
- **Fix B**: Keep static HTML and add a small script for password visibility
  - Strength: Preserves the “form always visible” guarantee; matches the uncommitted follow-up already started.
  - Tradeoff: Client validation and pending submit stay dead unless also reimplemented outside React.
  - Confidence: HIGH — native POST already works; script only restores the toggle.
  - Blind spot: View-transition / `astro:page-load` rebinding needs a pass if that script lands.
- **Decision**: FIXED via Fix B (Fix A reverted — client:load emptied the forms; workerd `useState` of null)

### F3 — Unplanned `listFlashcards` helper

- **Severity**: 👀 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/lib/services/list-flashcards.ts
- **Detail**: Phase 3 planned the dashboard load inline (`createClient` + `created_at` desc). The query and snake_case → `Flashcard` map were extracted into this helper. Behavior matches the plan (no paste column, RLS isolation, newest first). Not product scope creep.
- **Fix**: Add a one-line plan addendum that dashboard load lives in `src/lib/services/list-flashcards.ts`.
- **Decision**: FIXED
