# Review kept cards with a ready-made SRS Implementation Plan

## Overview

A signed-in learner can review **kept** flashcards with official `ts-fsrs` (FR-008 / US-01). Custom scheduling stays a Non-Goal. This slice adds FSRS columns, a due queue, server-side `next()`, and a `/review` session. It does not reopen the S-03 keep path.

## Current State Analysis

`public.flashcards` is content plus `generated` / `kept` (`supabase/migrations/20260913152707_create_flashcards.sql:1-14`). `FLASHCARD_COLUMNS` / `toFlashcard` select those eleven fields only (`src/lib/services/flashcard-row.ts:4-36`). Keep, edit-to-kept, and un-keep write status (and content on edit) — never scheduler state (`src/lib/services/mutate-flashcard.ts:55-77`). `listFlashcards` is the inbox, newest first, every status (`src/lib/services/list-flashcards.ts:25-35`).

There is no `/review` page, no GET JSON route, and no `ts-fsrs` dependency. `PROTECTED_ROUTES` is `["/dashboard"]` (`src/lib/auth.ts:3`). Card JSON writes copy `requireUser` + local `jsonResponse` + a per-service `{ status, code }` error class. Dashboard SSR-loads then hydrates one `client:load` island (`src/pages/dashboard.astro:8-18,44`). Layout has no product nav; the dashboard header is email + Sign out only.

S-03 shipped the gate and assigned S-04 the un-keep scheduler reset (`context/changes/gate-generated-cards/plan.md:239`). Research confirmed the library API and rejected following `ts-fsrs-api-docs.md` as a drop-in wiring checklist: keep is status-only, existing `kept` rows have no `due`, and the island must not persist a client-computed `Card`.

## Desired End State

On `/review`, a signed-in learner sees the next due kept card: cloze first, then the other five fields after Reveal, then Again / Hard / Good / Easy with server interval labels. Grading runs `fsrs().next()` on the Worker, persists the new card, and shows the next card that is due **now** (one-pass). `generated` cards never appear. Existing `kept` rows with null FSRS fields appear as due. Un-keep nulls scheduler columns so a later Accept starts New. Guests hitting `/review` are redirected to sign-in. User B never sees or grades user A’s cards. Dashboard `Flashcard` / island zod stay content-only. Lint and build stay green.

Verify: apply the new migration; curl `GET`/`POST /api/review`; walk `/review` (reveal → grade → empty); un-keep a reviewed card and confirm it leaves the queue with null FSRS columns; sign in as a second user.

### Key Discoveries:

- Scheduler contract is `createEmptyCard` / `fsrs()` / `repeat` / `next` / `Rating` 1–4; persist the `Card` fields, not a custom algorithm (`context/changes/ts-fsrs-api-docs.md:11-24`, `library-survey.md:31-44`).
- `flashcards.status` is the gate. ts-fsrs `state` is `New=0 | Learning=1 | Review=2 | Relearning=3`. Do not overload `status` (`research.md:61`, Context7 `/open-spaced-repetition/ts-fsrs` types).
- `FLASHCARD_COLUMNS` is shared by generate, list, and mutate (`flashcard-row.ts:4-5`). Extending it forces dashboard `FlashcardItem` / `PasteGenerate` zod to know FSRS. Use a slimmer review DTO instead (`research.md:169`).
- Card writes that miss RLS return `error: null` and empty `data` — map to 404, not 503; do not use `.single()` as the emptiness check (`gate-generated-cards/plan.md:50`).
- `scheduled_days` is often `0` during learning steps while `card.due` is a minute away. Interval labels must be `preview[grade].card.due − now`, not `log.scheduled_days` (Context7 scheduler API / types).
- `order(..., { nullsFirst: false })` emits `.nullslast`. Among due rows, that puts overdue timestamps before null `due` (treated as now). `nullsFirst: true` would show brand-new kept cards before overdue ones (postgrest-js `order()`).
- JSON review routes stay off `PROTECTED_ROUTES` and use `requireUser`. Add `/review` only in `src/lib/auth.ts` (`middleware.ts:21-22`).
- No test runner. Automated checks stay `npx astro sync`, `npm run lint`, `npm run build`.

## What We're NOT Doing

- A custom scheduler, trained weights, `fsrs({ ... })` overrides, `@open-spaced-repetition/binding`, or `fsrs-browser`.
- A `review_logs` table or persisting `result.log`.
- `createEmptyCard()` on keep/edit, or a backfill of existing `kept` rows (lazy first review only).
- Re-queuing Again / learning cards in the same sitting.
- Persisting a client-computed `Card` from `next()` / `repeat()`.
- Adding FSRS fields to `Flashcard`, `FLASHCARD_COLUMNS`, or dashboard island zod.
- Changing generate insert, or treating `generated` as study.
- Browse chrome (S-06), manual create (S-05), batch review, or a global nav / `Topbar` on dashboard.
- Changing `DEFAULT_RETURN_PATH` (still `/dashboard`).
- A test runner.

## Implementation Approach

Keep the cookie session and the existing table. Add nullable FSRS columns on `flashcards`. Add `ts-fsrs` and run the scheduler only in `src/lib/services/`. Expose one authenticated JSON resource `GET`/`POST /api/review`. Leave keep/edit status-only; un-keep nulls FSRS columns in the same UPDATE. Hydrate `/review` like dashboard: SSR the first payload, `client:load` island for reveal / grade / next. Put a Review link on the dashboard header and a Dashboard link on the review header.

## Critical Implementation Details

### Timing & lifecycle

One `now` per request (Worker clock). `GET` includes `kept` rows with null FSRS as due, builds `createEmptyCard(now)` **in memory**, runs `repeat()` for labels, and does **not** UPDATE. The first write is `POST`: load the row, `createEmptyCard(now)` if FSRS is null, `fsrs().next(card, now, grade)`, persist `result.card`. Do not trust a client `Card`.

### User experience spec

Only the cloze is visible at first. Reveal shows the other five fields, then the four grade buttons (names plus the GET interval strings). After a successful grade, replace the card and reset reveal. Do not show that Again card again unless a later request finds its new `due <= now`. Two empty copies: no kept cards vs kept but none due.

### State sequencing

Un-keep is one UPDATE: `status: "generated"` **and** every FSRS column null. Keep and edit stay status/content only — they must not init or reset FSRS. Grade is allowed only if the row is in the current queue (`kept` and `due` is null or `<= now`). Otherwise 404, same as an unknown or other-user id.

---

## Phase 1: Scheduler persist + review API

### Overview

Add `ts-fsrs`, nullable FSRS columns, a review mapper/service, un-keep reset, and `GET`/`POST /api/review` so the session contract can be curled without UI.

### Changes Required:

#### 1. Dependency

**File**: `package.json`

**Intent**: Use the official FSRS-6 scheduler already chosen for this slice.

**Contract**: Add runtime dependency `ts-fsrs`. Do not add optimizer, NAPI, or WASM siblings.

#### 2. FSRS columns on `flashcards`

**File**: `supabase/migrations/<cli-timestamp>_add_flashcard_fsrs.sql` (create with `npx supabase migration new add_flashcard_fsrs`; do not invent the timestamp)

**Intent**: Persist a ts-fsrs `Card` on the same row so the due queue needs no join. Existing RLS already covers the new columns.

**Contract**: Nullable columns matching `Card`: `due` / `last_review` `timestamptz`; `stability` / `difficulty` `double precision`; `elapsed_days` / `scheduled_days` / `learning_steps` / `reps` / `lapses` `integer`; `state` `smallint` with check `state IS NULL OR state IN (0, 1, 2, 3)`. No defaults (lazy). Partial index on `(user_id, due)` `WHERE status = 'kept'` (or equivalent) to serve the queue. Do not add a table or new RLS policies. Persist `elapsed_days` even though FSRS-6 marks it deprecated — `next()` still returns it.

#### 3. Review types

**File**: `src/types.ts`

**Intent**: Give the route, service, SSR page, and later island one session contract that is not `Flashcard`.

**Contract**: Export a review card (id + six cloze fields only), grade `1 | 2 | 3 | 4`, POST body `{ cardId, grade }`, and a session payload: `card` or `null`, `remaining` (queue size including the current card), optional `emptyReason` (`"no_kept"` | `"none_due"` when `card` is null), and `grades` (four interval strings keyed 1–4) when `card` is present. No FSRS fields, no `status`, no `userId` on the wire.

#### 4. FSRS row helper

**File**: `src/lib/services/flashcard-fsrs.ts` (new)

**Intent**: Convert between Postgres columns, `CardInput` / `Card`, and interval labels without touching `FLASHCARD_COLUMNS`.

**Contract**: Detect “empty scheduler” as all FSRS columns null. `toCardInput` / persist from `result.card` using ISO / `timestamptz` (TypeConvert accepts Date, millis, or ISO — prefer ISO, not a second millis convention). `repeat()` / `next()` use default `fsrs()`. Format each preview label from `preview[grade].card.due − now` (compact strings such as `<1m`, `10m`, `4d`). Do not use `scheduled_days` for labels.

#### 5. Review session service

**File**: `src/lib/services/review-session.ts` (new)

**Intent**: Own the due queue and the grade write, scoped to the session user.

**Contract**:

- Input includes `userId` from `locals.user.id` only, `supabase`, and a single `now`.
- Queue predicate: `status = 'kept' AND (due IS NULL OR due <= now)`. Also `.eq("user_id", userId)`. Never reuse `listFlashcards`.
- Order: `due` ascending with `nullsFirst: false`, then `created_at` ascending, then `id` ascending. Limit one row for the current card; `remaining` is the count of the same filter.
- `emptyReason`: if remaining is 0, `"no_kept"` when the user has zero `kept` rows, otherwise `"none_due"`.
- Grade: reject with 400 on grade outside 1–4 (zod at the route is enough). Load the target row; if it is not in the queue, 404. Lazy `createEmptyCard(now)` then `next(card, now, grade)`. UPDATE FSRS columns only (not cloze fields). Return the same payload shape as GET (next due card or empty).
- Typed errors with `status` + `code`, parallel to `MutateFlashcardError` (404 `not_found`, 503 unavailable). Empty `.select()` after UPDATE → 404.

Queue filter (non-obvious vs the notes’ `due <= now` only):

```ts
.eq("user_id", userId)
.eq("status", "kept")
.or(`due.is.null,due.lte.${now.toISOString()}`)
.order("due", { ascending: true, nullsFirst: false })
.order("created_at", { ascending: true })
.order("id", { ascending: true })
```

#### 6. `GET` / `POST /api/review`

**File**: `src/pages/api/review.ts` (new)

**Intent**: First JSON GET in this repo; cookie-authenticated read of the next card and write of one grade.

**Contract**: `export const prerender = false`. `GET` and `POST`. `requireUser` first (401). Missing Supabase client → 503. Copy a local `jsonResponse` — do not extract a shared helper. POST body zod: `cardId` UUID, `grade` `z.union` of literals 1–4 (blocks `Rating.Manual` / 0 and `FSRSValidationError`). Success 200 with the session payload. Do not log card fields.

#### 7. Un-keep reset

**File**: `src/lib/services/mutate-flashcard.ts`

**Intent**: Honor S-03’s assignment: un-keep must clear scheduler state so a later keep starts New.

**Contract**: `unkeep` UPDATE sets `status: "generated"` and every FSRS column to `null` in the same write. `.select(FLASHCARD_COLUMNS)` stays content-only. `keep` and `edit` must not write FSRS columns.

### Success Criteria:

#### Automated Verification:

- New migration from `npx supabase migration new add_flashcard_fsrs` adds the nullable FSRS columns and queue index; it applies locally
- `ts-fsrs` is a runtime dependency in `package.json`
- `src/pages/api/review.ts` exports `const prerender = false`, `GET`, and `POST`
- `src/types.ts` exports the review session request and response types
- `FLASHCARD_COLUMNS` and the dashboard `Flashcard` type stay content-only (no FSRS fields)
- Un-keep UPDATE nulls FSRS columns in the same write as `status: "generated"`
- `npx astro sync` succeeds
- `npm run lint` succeeds
- `npm run build` succeeds

#### Manual Verification:

- Unauthenticated GET/POST `/api/review` → 401; no row change
- Signed-in GET with existing `kept` (null FSRS) → 200, a card, `remaining >= 1`, four interval strings; the row is still all-null FSRS (GET does not write)
- Signed-in GET with only `generated` cards → 200, `card: null`, `emptyReason: "no_kept"`
- Signed-in GET with `kept` cards all due in the future → 200, `card: null`, `emptyReason: "none_due"`
- Signed-in POST grade 1–4 on the due card → 200, FSRS columns persisted, next card or empty; an Again card is not returned if its new `due` is in the future
- Signed-in POST with grade 0 / 5 or a missing `cardId` → 400; row unchanged
- Signed-in POST on a `generated` card, another user’s card, or a kept card that is not due → 404; row unchanged
- Un-keep a reviewed card → status `generated` and FSRS columns null; GET no longer returns it
- Two kept cards with the same `due` (or both null) → GET returns the older `created_at`, then lower `id`
- Signed-in as user B, GET/POST user A’s `cardId` → empty or 404; A’s row unchanged

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

2026-09-13: Phase 1 manuals 1.10–1.19 were waived so Phase 2 could start. Progress boxes stay unchecked until a human or `/10x-implement` records the actual checks.

---

## Phase 2: Review session UI

### Overview

Add the protected `/review` surface: cloze → reveal → grade with interval labels, both empty states, and a dashboard entry.

### Changes Required:

#### 1. Protect `/review`

**File**: `src/lib/auth.ts`

**Intent**: Guests requesting the HTML session get the same sign-in redirect as `/dashboard`.

**Contract**: Append `"/review"` to `PROTECTED_ROUTES`. Do not add a second list in `middleware.ts`. Leave `DEFAULT_RETURN_PATH` as `"/dashboard"`. JSON `/api/review` stays off this list.

#### 2. Review page + island

**Files**: `src/pages/review.astro` (new); `src/components/cards/ReviewSession.tsx` (new)

**Intent**: Same SSR + `client:load` pattern as dashboard, with a review-only DTO so the island never parses FSRS internals.

**Contract**:

- `review.astro` uses the session SSR client, calls the same “current session payload” helper as GET, and passes `{ initialSession, loadError }` into `ReviewSession` with `client:load`. Missing client or a thrown load → `loadError` (do not crash the page).
- Island `fetch`es `POST /api/review` with `credentials: "same-origin"` and zod-parses the session payload (same style as `FlashcardItem`).
- Start: cloze only. Reveal: the other five fields, then Again / Hard / Good / Easy plus the four server interval strings. Grades are not visible before Reveal.
- While a grade `fetch` is in flight, disable the buttons. Success replaces the session payload and resets reveal. Failure: inline error, card stays. 404 uses “Card not found.” — do not say it is someone else’s.
- `emptyReason === "no_kept"` vs `"none_due"` get different copy; both offer a link to `/dashboard`. `loadError` uses the dashboard idea: could not load, refresh to try again.
- Merge classes with `cn()`. No `"use client"`. No env secrets in the island. Do not import `ts-fsrs` in the island.

#### 3. Cross-links

**Files**: `src/pages/dashboard.astro`; `src/pages/review.astro`

**Intent**: The learner can reach the session from the inbox and return without a global nav.

**Contract**: Dashboard header (next to Sign out) links to `/review`. Review header links to `/dashboard`. Do not mount `Topbar` on dashboard. Optional Sign out on the review header is fine if it matches dashboard chrome.

### Success Criteria:

#### Automated Verification:

- `src/pages/review.astro` exists and hydrates a `client:load` review island
- `PROTECTED_ROUTES` includes `/review`
- Dashboard header links to `/review`; review page links to `/dashboard`
- `npx astro sync` succeeds
- `npm run lint` succeeds
- `npm run build` succeeds

#### Manual Verification:

- Guest `/review` redirects to sign-in with `next=/review`; after sign-in they can return there
- Cloze shows first; grades stay hidden until Reveal; Reveal shows the other five fields then grades with interval labels
- Grading replaces the card, resets reveal, and does not show the Again card again in this sitting when its new due is in the future
- `no_kept` vs `none_due` copy is distinct; both can reach `/dashboard`
- Dashboard Review link opens the session; short actions do not freeze the page; a failed grade shows an error on the card
- Signed in as user B, none of user A’s cards appear on `/review`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful.

---

## Testing Strategy

### Unit Tests:

- None. No test runner in this slice.

### Integration Tests:

- None in CI. Automated checks are `npx astro sync`, `npm run lint`, and `npm run build`.

### Manual Testing Steps:

1. Sign in as user A. Accept at least two generated cards (null FSRS). Open `/review` — first card is the older `created_at`; only cloze is visible.
2. Reveal — five fields + four grades with interval labels. Do not grade yet. Confirm the row still has null FSRS (GET is read-only).
3. Grade Good — next due card appears with reveal reset. First card now has persisted FSRS and a future `due`.
4. Grade Again on the second card — it leaves this sitting; empty `none_due` (or the next overdue card if any).
5. Dashboard Un-keep the reviewed card — status `generated`, FSRS columns null; `/review` does not show it.
6. Accept it again — it is due immediately (lazy); first grade starts New, not the old stability.
7. User with only generated cards — `/review` shows `no_kept`.
8. Guest `/review` → sign-in; guest `GET /api/review` → 401.
9. Sign in as user B — no A cards; POSTing A’s id → 404.

## Performance Considerations

Each GET/POST is a count plus at most one row read/write and an in-process `repeat()` / `next()`. No OpenRouter call. Stay under the NFR: acknowledge without a frozen screen; a per-grade pending state is enough.

## Migration Notes

Existing `generated` rows stay null FSRS and stay out of the queue. Existing `kept` rows stay null FSRS and **all appear as due** until graded (lazy). Generate insert does not set the new columns. Hosted and local Postgres both need the new migration; CI lint/build does not apply it.

Rollback: drop the FSRS columns and remove the review route/UI. Content and `generated`/`kept` remain valid. Scheduler history is lost (no `review_logs`).

S-05 insert-as-kept can stay lazy: null FSRS until first grade. Do not invent a second init helper unless that slice needs one.

## References

- Related research: `context/changes/srs-review-session/research.md`
- Library survey: `context/changes/srs-review-session/library-survey.md`
- Scheduler notes: `context/changes/ts-fsrs-api-docs.md`
- S-03 un-keep assignment: `context/changes/gate-generated-cards/plan.md`
- PRD FR-008 / Non-Goal: `context/foundation/prd.md`
- Roadmap S-04: `context/foundation/roadmap.md`
- Card JSON pattern: `src/pages/api/cards/[id].ts`
- Island fetch pattern: `src/components/cards/FlashcardItem.tsx`
- ts-fsrs types / `repeat` / `next`: Context7 `/open-spaced-repetition/ts-fsrs`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Scheduler persist + review API

#### Automated

- [x] 1.1 New migration from `npx supabase migration new add_flashcard_fsrs` adds the nullable FSRS columns and queue index; it applies locally — e3cc09a
- [x] 1.2 `ts-fsrs` is a runtime dependency in `package.json` — e3cc09a
- [x] 1.3 `src/pages/api/review.ts` exports `const prerender = false`, `GET`, and `POST` — e3cc09a
- [x] 1.4 `src/types.ts` exports the review session request and response types — e3cc09a
- [x] 1.5 `FLASHCARD_COLUMNS` and the dashboard `Flashcard` type stay content-only (no FSRS fields) — e3cc09a
- [x] 1.6 Un-keep UPDATE nulls FSRS columns in the same write as `status: "generated"` — e3cc09a
- [x] 1.7 `npx astro sync` succeeds — e3cc09a
- [x] 1.8 `npm run lint` succeeds — e3cc09a
- [x] 1.9 `npm run build` succeeds — e3cc09a

#### Manual

- [ ] 1.10 Unauthenticated GET/POST `/api/review` → 401; no row change
- [ ] 1.11 Signed-in GET with existing `kept` (null FSRS) → 200, a card, `remaining >= 1`, four interval strings; the row is still all-null FSRS (GET does not write)
- [ ] 1.12 Signed-in GET with only `generated` cards → 200, `card: null`, `emptyReason: "no_kept"`
- [ ] 1.13 Signed-in GET with `kept` cards all due in the future → 200, `card: null`, `emptyReason: "none_due"`
- [ ] 1.14 Signed-in POST grade 1–4 on the due card → 200, FSRS columns persisted, next card or empty; an Again card is not returned if its new `due` is in the future
- [ ] 1.15 Signed-in POST with grade 0 / 5 or a missing `cardId` → 400; row unchanged
- [ ] 1.16 Signed-in POST on a `generated` card, another user’s card, or a kept card that is not due → 404; row unchanged
- [ ] 1.17 Un-keep a reviewed card → status `generated` and FSRS columns null; GET no longer returns it
- [ ] 1.18 Two kept cards with the same `due` (or both null) → GET returns the older `created_at`, then lower `id`
- [ ] 1.19 Signed-in as user B, GET/POST user A’s `cardId` → empty or 404; A’s row unchanged

### Phase 2: Review session UI

#### Automated

- [x] 2.1 `src/pages/review.astro` exists and hydrates a `client:load` review island — fe5ae2b
- [x] 2.2 `PROTECTED_ROUTES` includes `/review` — fe5ae2b
- [x] 2.3 Dashboard header links to `/review`; review page links to `/dashboard` — fe5ae2b
- [x] 2.4 `npx astro sync` succeeds — fe5ae2b
- [x] 2.5 `npm run lint` succeeds — fe5ae2b
- [x] 2.6 `npm run build` succeeds — fe5ae2b

#### Manual

- [ ] 2.7 Guest `/review` redirects to sign-in with `next=/review`; after sign-in they can return there
- [ ] 2.8 Cloze shows first; grades stay hidden until Reveal; Reveal shows the other five fields then grades with interval labels
- [ ] 2.9 Grading replaces the card, resets reveal, and does not show the Again card again in this sitting when its new due is in the future
- [ ] 2.10 `no_kept` vs `none_due` copy is distinct; both can reach `/dashboard`
- [ ] 2.11 Dashboard Review link opens the session; short actions do not freeze the page; a failed grade shows an error on the card
- [ ] 2.12 Signed in as user B, none of user A’s cards appear on `/review`
