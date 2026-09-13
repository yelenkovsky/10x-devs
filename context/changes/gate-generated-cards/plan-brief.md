# Gate generated cards — Plan Brief

> Full plan: `context/changes/gate-generated-cards/plan.md`
> Roadmap: `context/foundation/roadmap.md` (S-03)

## What & Why

Without a gate, generated cards land in the deck unreviewed and the first session skips a required step. This slice lets a signed-in learner accept, edit, or delete a generated flashcard before it is treated as kept for study (US-01, FR-005), and edit, delete, or un-keep after accept.

## Starting Point

S-01 already persists cloze cards as `generated` with owner UPDATE/DELETE RLS. `/dashboard` lists every card newest-first; `FlashcardItem` is read-only and ignores `status`. There is no mutation API. S-04 will review `kept` only.

## Desired End State

On `/dashboard`, each card shows generated or kept. The learner can keep, edit, delete, or un-keep per card. Leftovers stay `generated` until they act. Another account never sees or changes the rows. Review still does not run in this slice.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Persist vs gate | S-01 saves `generated`; this slice flips `kept` / deletes / un-keeps | Refresh kept the inbox; the gate is explicit | S-01 / Plan |
| Save on generated | Save also keeps | Edit is the accept path for a changed card — no second Accept click | Plan |
| Leftovers | Stay `generated` until they act | Forced gate; S-04 ignores `generated` | Plan |
| After keep | Edit (stay kept), delete, un-keep | Full control without a new status | Plan |
| Inbox scope | Every generated card on the dashboard list | S-01 accumulates; older batches still need a gate | Plan |
| Batch keep | Per-card only | Matches singular FR-005; cap is already 15 | Plan |
| FSRS on accept | Status only | Un-keep stays a status flip; S-04 owns scheduler init | Plan |
| Edit validation | Six trimmed non-empty fields | Same as generate zod; no typical-use re-score | Plan |
| API shape | `POST /api/cards/:id` + `action` | Matches generate and `AGENTS.md` GET/POST | Plan |
| Surface | Existing `/dashboard` list | First-session gate, not S-06 browse | Roadmap / Plan |

## Scope

**In scope:** Shared row mapper; mutate API (keep / un-keep / edit / delete); dashboard status + per-card actions + inline edit.

**Out of scope:** FSRS columns; batch keep; browse chrome; manual create; typical-use checker; new routes; test runner; 75% accept tracking.

## Architecture / Approach

The island `POST`s `POST /api/cards/:id` (`requireUser`, zod, session SSR client). The service updates or deletes one row the JWT owns, `.select()`s, and maps empty data to 404. Save-on-generated writes `kept`; save-on-kept stays `kept`; `unkeep` is the only post-insert `generated` write.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Card mutation API | Shared mapper + `POST /api/cards/:id` | 0-row RLS miss mapped as 503 instead of 404 |
| 2. Dashboard gate UI | Status, accept/edit/delete/un-keep | Save-generated must keep; leftovers must not vanish |

**Prerequisites:** S-01 applied (local + hosted `flashcards` + generate). Signed-in session. No new secrets.
**Estimated effort:** ~2 sessions across 2 phases.

## Open Risks & Assumptions

- The inbox can grow across generates; cleanup is the learner’s deletes, not an expiry.
- When S-04 adds FSRS, un-keep will need a scheduler reset this slice does not design.
- Hosted RLS already allows UPDATE/DELETE; no migration ships here.

## Success Criteria (Summary)

- Accept, edit-and-keep, delete, and un-keep work on the dashboard list and survive refresh.
- Untouched generated cards stay generated and out of future study until S-04.
- User B cannot see or mutate user A’s cards.
