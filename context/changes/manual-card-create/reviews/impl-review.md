<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Create a flashcard by hand

- **Plan**: context/changes/manual-card-create/plan.md
- **Scope**: Phases 1–2 of 2
- **Date**: 2026-09-13
- **Verdict**: APPROVED
- **Findings**: 0 critical 0 warnings 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — Create form has the same residual double-submit race as edit

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/cards/CreateFlashcard.tsx:120
- **Detail**: `handleSave` does not guard `isPending` before `void submitCreate(trimmed)`, and `submitCreate` has no `AbortSignal`. Pending UI disables Save / Cancel / fields after the first re-render, matching `FlashcardItem.handleSave`. Two Enter/clicks in that window can POST twice. Product allows duplicate `word_phrase`, so the user gets two `kept` due rows (null FSRS), not a conflict.
- **Fix**: Add `if (isPending) return;` at the top of `handleSave`.
- **Decision**: FIXED
