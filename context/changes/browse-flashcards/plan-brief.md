# Browse saved flashcards — Plan Brief

> Full plan: `context/changes/browse-flashcards/plan.md`
> Roadmap: `context/foundation/roadmap.md` (S-06)

## What & Why

A self-learner must be able to browse their flashcards (FR-007). The first session is a review queue, not a catalog; siblings shipped an inbox on `/dashboard` so persist and the gate are visible, and left browse/search/filter chrome to this slice.

## Starting Point

`/dashboard` already lists every owned `generated` + `kept` row newest-first via `listFlashcards`, with `FlashcardItem` actions and no find, status chips, or cap. `/review` is a due queue. `Topbar` is home-only. There is no `/cards`.

## Desired End State

Signed in, they open `/cards`, scan both statuses newest first, narrow with All / Generated / Kept and a word/phrase find, and gate a card in place. Newest 1000 matching rows; if more exist, the page says so. Topbar reaches Dashboard, Cards, and Review. Another account never sees the list.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| What browse adds | Catalog they can scan and narrow | Inbox already shows cards; FR-007 is chrome, not a second dump | Plan |
| Which rows | All statuses, All / Generated / Kept | Leftovers stay findable; the kept deck is one chip away | Plan |
| Surface | New `/cards` | Dashboard stays the paste/gate/create workbench | Plan |
| Find | Status chips + `word_phrase` contains | Matches deferred “search/filter” without a text index | Plan |
| Cap | Newest 1000 + visible note | Honest about PostgREST 1000 without a pager | Plan |
| Filter vs cap | Server filter, then `limit 1001` | Client-filtering newest 1000 would hide old leftovers | Plan |
| Actions | Reuse `FlashcardItem` | Finding a leftover is useless if they must return to the inbox to gate it | Plan |
| Sort | `created_at` desc, `id` desc | Same-timestamp generate twins no longer reshuffle | Plan |
| Nav | Grow `Topbar` on product pages | User chose global nav; S-04 only deferred it, not banned it | Plan |
| List API | None — URL GET + SSR | Chips/find are shareable; no `GET /api/cards` | Plan |

## Scope

**In scope:** Browse helper (filter + cap); `/cards` + `PROTECTED_ROUTES`; chips + find; `FlashcardItem` on the catalog; empty/load/cap copy; Topbar on home/dashboard/review/cards; inbox sort tiebreak.

**Out of scope:** Pagination past 1000; full-text search; FSRS on the catalog; generate/create on `/cards`; inbox cap/filter; folders/tags/bulk; test runner; Topbar on auth pages.

## Architecture / Approach

`/cards?status=&q=` SSR-calls a browse helper (RLS + explicit `user_id`, status eq, escaped `word_phrase` ilike, newest 1000 via 1001-row fetch). A React island hydrates that list and reuses `FlashcardItem` → existing `POST /api/cards/:id`. `Topbar` becomes signed-in global nav; page title cards drop duplicate links.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Browse list query | Stable sort + filtered/capped helper | Filtering after the cap hides leftovers |
| 2. `/cards` catalog | Protected page, chips, find, gate actions | Empty/filter/loadError copy collapsing into one sentence |
| 3. Global Topbar | Dashboard / Cards / Review on signed-in pages | Duplicate email/sign-out if headers are not stripped |

**Prerequisites:** S-01 table + RLS; S-03 `FlashcardItem`; signed-in session. No new secrets or migration.
**Estimated effort:** ~2–3 sessions across 3 phases.

## Open Risks & Assumptions

- Hosted PostgREST `max_rows` stays 1000; the cap note is the product response, not a pager.
- Inbox remains uncapped (same silent 1000 ceiling as today).
- `ilike` on `word_phrase` is fine at this scale; no new index.

## Success Criteria (Summary)

- Learner can open `/cards`, narrow by status and word/phrase, and accept/edit/delete/un-keep there.
- Cap note only when more than 1000 matching rows exist; user B never sees user A’s cards.
- Signed-in Topbar reaches Dashboard, Cards, and Review from each of those pages.
