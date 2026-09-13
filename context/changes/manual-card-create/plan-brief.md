# Create a flashcard by hand — Plan Brief

> Full plan: `context/changes/manual-card-create/plan.md`
> Roadmap: `context/foundation/roadmap.md` (S-05)

## What & Why

A self-learner must be able to create a flashcard by hand with the same fields as generated cards, under the same typical-use bar (US-01, FR-006). This is required collection work, not the paste-generate-review proving path, but the first-session criteria include “or create a card by hand.”

## Starting Point

Generate is the only insert (`generated` + shared `generation_id`). Edit already validates six trimmed non-empty fields and does not re-score typical use. `/dashboard` is the inbox; empty copy is generate-only. `/review` queues `kept` with null FSRS as due. `generation_id` is `NOT NULL`. There is no create API or form.

## Desired End State

On `/dashboard`, the learner opens “Create a card by hand”, fills the six fields with typical-use hints, and saves. The card lands at the top as `kept`, survives refresh, and is due on `/review`. Empty dashboard and empty review mention this path. Another account never sees the row.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Status on create | Insert as `kept` | US-01 treats hand-create as a peer of Accept; S-04 already allows lazy insert-as-kept | Plan |
| FSRS on insert | Omit columns (all null) | Do not invent a second `createEmptyCard` helper | S-04 / Plan |
| `generation_id` | Server `crypto.randomUUID()` per card | Column is `NOT NULL`; never take it from the body | Research / Plan |
| Typical-use bar | Hints on the form + human spot-check; six non-empty fields | Same automated bar as edit; S-03 skipped a re-score | Plan |
| Surface | `/dashboard` toggle | First-session “or create by hand” stays on the inbox; S-06 does not exist | Plan |
| After save | Prepend, clear, collapse; stay on dashboard | One card per submit; generate-style accumulate | Plan |
| Duplicates | Accumulate, no warning | Same as generate; delete is the cleanup | S-01 / Plan |
| Empty copy | Update dashboard + `/review` `no_kept` | Without it, an empty deck still hides the path | Plan |
| API | `POST /api/cards/create` | Verb sibling of `generate`; no id yet for `[id]` | Plan |
| Cut line | Keep empty copy; drop extra chrome | Copy is how the feature is found | Plan |

## Scope

**In scope:** Shared six-field schema; create service + `POST /api/cards/create`; dashboard toggle form with hints; prepend/clear/collapse; empty-state copy on dashboard and review.

**Out of scope:** Browse chrome; new HTML route; AI-fill; typical-use checker / `_____` require; dedup; FSRS init; tabs or always-on form; jump to `/review`; test runner.

## Architecture / Approach

The island `POST`s six fields to `/api/cards/create` (`requireUser`, shared zod, session SSR client). The service inserts one owned row as `kept` with a minted `generation_id` and no FSRS columns. `PasteGenerate` prepends the returned `Flashcard`. `/review` already treats that row as due.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Create API | Shared schema + `POST /api/cards/create` (insert-as-kept) | Forgetting `generation_id`, or writing partial FSRS |
| 2. Dashboard UI + empty copy | Toggle form, prepend, review/dashboard empty copy | Form always-on or empty copy still generate-only |

**Prerequisites:** S-01 table + RLS; S-03 mutate/edit for field parity; S-04 lazy queue (so insert-as-kept is due). Signed-in session. No new secrets.
**Estimated effort:** ~2 sessions across 2 phases.

## Open Risks & Assumptions

- Hosted `flashcards` already has INSERT RLS and nullable FSRS; no migration ships here.
- A sloppy hand-made card is immediately reviewable; quality is hints + spot-check, not a server gate.
- If older overdue `kept` cards exist, `/review` may show those before the new null-`due` card (existing queue order). This slice does not change sort.

## Success Criteria (Summary)

- Learner can save a six-field card by hand, see it as `kept` after refresh, and review it when it is due.
- Empty dashboard and empty review name create by hand; user B never sees user A’s card.
- Hand-made cards meet the typical-use bar on a human spot-check of one or two cards.
