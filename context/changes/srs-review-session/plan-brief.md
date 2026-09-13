# Review kept cards with a ready-made SRS — Plan Brief

> Full plan: `context/changes/srs-review-session/plan.md`
> Research: `context/changes/srs-review-session/research.md`

## What & Why

A signed-in learner must be able to review kept flashcards with a ready-made spaced-repetition algorithm (US-01, FR-008). Custom scheduling is a PRD Non-Goal. This slice wires official `ts-fsrs` onto the S-03 gate so the first session can finish.

## Starting Point

Keep is status-only. `flashcards` has no `due`. Existing `kept` rows cannot satisfy `due <= now`. There is no `/review` page, no GET JSON API, and no `ts-fsrs` dependency. The dashboard island is the inbox, not a study queue.

## Desired End State

On `/review`, the learner sees the next due kept card (cloze, then reveal, then Again / Hard / Good / Easy with interval labels). Grading updates FSRS on the Worker and continues with the next card due right now. Un-keep clears scheduler state. Another account never sees these cards.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Library | `ts-fsrs`, default `fsrs()` | Official FSRS-6, Workers-safe, matches the Non-Goal | Research |
| `next()` placement | Server only; never persist a client `Card` | Same as generate/mutate: island fetches, service writes | Research |
| Init | Lazy on first review (GET in-memory, POST writes) | Fits shipped keep and existing null-`due` kept rows | Plan |
| Persist shape | Same-row nullable FSRS columns | One queue query; no join | Research |
| Review log | Skip | Optional in the notes; not needed for a first session | Research |
| Un-keep | Null all FSRS columns with `status: "generated"` | S-03 assigned the reset; re-keep starts New | Plan / S-03 |
| Session | One-pass `due <= now` | Again leaves until its new due; no custom requeue | Plan |
| Queue order | `due` ASC NULLS LAST, then oldest `created_at`, then `id` | Null `due` means now, so overdue beats brand-new kept | Plan |
| Review face | Cloze → reveal five fields → grade | Recall before the answer | Plan |
| Interval labels | Server `repeat()`, from `due − now` | Learning steps often have `scheduled_days = 0` | Plan |
| DTO | Slim `ReviewCard`; `FLASHCARD_COLUMNS` unchanged | Dashboard zod must not grow scheduler fields | Research / Plan |

## Scope

**In scope:** `ts-fsrs`; FSRS columns + queue index; review service; `GET`/`POST /api/review`; un-keep reset; `/review` island; dashboard ↔ review links; `/review` on `PROTECTED_ROUTES`.

**Out of scope:** Custom algorithm / training; `review_logs`; keep-path init or backfill; Again requeue; FSRS on the dashboard DTO; S-05/S-06; test runner; global nav.

## Architecture / Approach

SSR `/review` loads the same session payload as `GET /api/review`. The island reveals and POSTs `{ cardId, grade: 1–4 }`. The Worker loads the owned queued row, lazy-inits if needed, runs `next()`, writes `result.card`, and returns the next due card. Queue: `kept AND (due IS NULL OR due <= now)`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Scheduler persist + review API | Migration, `ts-fsrs`, un-keep reset, `GET`/`POST /api/review` | GET writes FSRS, or `due <= now` hides existing kept |
| 2. Review session UI | `/review` cloze-reveal-grade, empty states, dashboard link | Grades visible before reveal; Again reappears this sitting |

**Prerequisites:** S-03 in the tree; local (and hosted) Postgres for the new migration; signed-in session. No new secrets.
**Estimated effort:** ~2 sessions across 2 phases.

## Open Risks & Assumptions

- Hosted `flashcards` must receive the migration; CI does not apply it.
- Every existing `kept` card is due on first `/review` (lazy). That is intended.
- One-pass Again (~1 minute later) is less like Anki than a requeue; accepted for MVP.
- `state` (FSRS) sits next to `status` (gate) — easy to mix up in queries.

## Success Criteria (Summary)

- A learner can accept cards, open `/review`, recall from cloze, reveal, grade, and continue until nothing is due now.
- Un-keep drops the card from study and clears FSRS; a later Accept is a New card.
- User B cannot see or grade user A’s cards.
