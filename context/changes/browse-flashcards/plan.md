# Browse saved flashcards Implementation Plan

## Overview

A signed-in learner opens `/cards` and browses their own cloze cards — generated leftovers and kept — newest first. They narrow with All / Generated / Kept and a word/phrase find, and they can Accept / Edit / Delete / Un-keep in place. The newest 1000 matching rows load; if the cap hits, the page says so. A shared Topbar reaches Dashboard, Cards, and Review. Generate and hand-create stay on `/dashboard`.

## Current State Analysis

S-01–S-05 shipped an **inbox**, not FR-007. `/dashboard` SSR-loads every owned row via `listFlashcards` (`src/lib/services/list-flashcards.ts:25-35`), newest `created_at` only, no status filter, no find, no `.limit`. `PasteGenerate` renders that array as `FlashcardItem`s. `/review` is a one-card due queue. There is no `/cards`, no list GET API, and no `browse-flashcards` folder until this change.

Siblings named this gap explicitly: “Browse/search/filter chrome (S-06). Dashboard lists the learner’s cards only so persist is visible.” S-03 called the dashboard list the first-session gate, not browse. S-04 added `/review` + header links and left Topbar/global nav out.

Isolation is RLS on `user_id`. `FLASHCARD_COLUMNS` / `Flashcard` stay content-only (no FSRS). Index `(user_id, created_at desc)` already matches newest-first. PostgREST `max_rows` is 1000 — today’s unbounded inbox can silently drop the oldest row.

`Topbar.astro` mounts only on `/` via `Welcome.astro`. Signed-in it shows email, Dashboard, and Sign out. Product pages each own a title card with their own link cluster.

## Desired End State

Signed in, the learner can open `/cards` from global nav, see their cards (both statuses) newest first with a stable tiebreak, narrow to generated or kept, find by `word_phrase`, and run the same per-card actions as the inbox. An empty deck explains generate/create on the dashboard. A filter or find that matches nothing says so — it does not look like a load failure. If 1000 matching rows are shown because more exist, a visible note says the newest 1000 are on screen. User B never sees user A’s cards. Guest `/cards` redirects to sign-in with `next` back to `/cards`. Lint and build stay green.

Verify by walking chips and find, gating a leftover on `/cards`, refreshing, hitting the cap note (or a 1001-row fixture), signing in as user B, and clicking Dashboard / Cards / Review from each signed-in page.

### Key Discoveries:

- `listFlashcards` is the inbox helper and must not become the study queue (`context/changes/srs-review-session/plan.md`). Browse may extend it; review stays on `getReviewSession`.
- Client-filtering the newest 1000 would hide old leftovers once kept cards fill the cap. Status and find must run **on the server before** the cap.
- `PROTECTED_ROUTES` lives in `src/lib/auth.ts:3` (`/dashboard`, `/review`). A new HTML page appends here; JSON writes still use `requireUser`.
- `FLASHCARD_COLUMNS` must stay content-only. Do not select FSRS on browse.
- S-01 impl-review: a list load failure must not look like an empty deck (`loadError`).
- Existing `Topbar.astro` is the right file to grow; product page headers must drop their duplicate link cluster or email/sign-out appear twice.

## What We're NOT Doing

- Pagination or a path to cards older than the newest 1000 matching rows.
- Full-text search across cloze / definition / translation.
- Showing FSRS, due, or review state on the catalog.
- `GET /api/cards` or a new mutation API.
- Folders, tags, bulk select, export, or multi-column sort.
- Moving paste-generate or hand-create onto `/cards`.
- Deduping `word_phrase`.
- Capping or filtering the `/dashboard` inbox (sort tiebreak only).
- A test runner, or chasing the 75% secondary criteria.
- Mounting Topbar on auth pages.
- Changing the review queue predicate or `ReviewCard`.

## Implementation Approach

Keep the cookie session and the existing table. Add a browse query that filters status and `word_phrase` first, then fetches one extra row past 1000 so the cap note is honest. `/cards` is an SSR page plus a list island that reuses `FlashcardItem`. Filter state lives in the URL (`status`, `q`) as GET links/form — no list JSON route. Grow `Topbar.astro` into signed-in global nav and strip the per-page header links S-04 added.

## Critical Implementation Details

### Timing & lifecycle

Apply status and word/phrase filters **before** the 1000-row cap. Select with `{ count: "exact" }` and `.limit(1000)`; set `capped` from `count > 1000`. Throw if `count` is null (cannot attest the cap). Do not treat `length === 1000` as “there might be more” — that false-positives an exact 1000, and PostgREST `max_rows` would hide a 1001st payload row anyway. Never client-filter a newest-1000 dump.

### User experience spec

Topbar owns identity and nav (Dashboard, Cards, Review, Sign out). Product title cards keep the page heading and drop the duplicate link cluster and the second email. Filter chips and find are GET navigation so the island can hydrate an already-narrowed list. Find is a short action — no generate-style elapsed panel.

---

## Phase 1: Browse list query

### Overview

Give inbox and catalog one stable newest-first order, and give browse a filtered, capped query that later `/cards` can call without inventing SQL in the page.

### Changes Required:

#### 1. Stable inbox sort

**File**: `src/lib/services/list-flashcards.ts`

**Intent**: Same-timestamp twins from one generate no longer reshuffle on refresh, and inbox vs browse do not disagree on order.

**Contract**: Keep returning `Flashcard[]` for the inbox. Order `created_at` desc, then `id` desc. No status filter, no find, no cap. Still select `FLASHCARD_COLUMNS` only. Still fail the load (throw) on a Supabase error or an unparsable non-empty payload; skip invalid rows the same way as today. Dashboard keeps calling this helper.

#### 2. Browse query

**Files**: `src/lib/services/list-flashcards.ts` (or a sibling `src/lib/services/list-browse-flashcards.ts` if a second export keeps the inbox signature clearer); `src/types.ts`

**Intent**: Catalog load is “matching rows, newest 1000, say if more exist” — not “newest 1000, then hope the chip still finds leftovers.”

**Contract**: Export a browse result `{ cards: Flashcard[]; capped: boolean }` and a status filter `"all" | "generated" | "kept"`. Input includes `supabase`, `userId` (from `locals.user.id` only), `status`, and trimmed `q`. Always `.eq("user_id", userId)`. When `status` is `generated` or `kept`, `.eq("status", status)`; `all` adds no status predicate. When `q` is non-empty after trim, case-insensitive contains on `word_phrase` only; treat `%` and `_` in `q` as literals (escape them). Order `created_at` desc, `id` desc. `BROWSE_CARD_CAP = 1000`. `.select(..., { count: "exact" })` and `.limit(1000)`; set `capped` from `count > 1000`. Throw if `count` is null (cannot attest the cap). Do not use a 1001st payload row — PostgREST `max_rows` is 1000 and would strip it. Same parse/skip/throw rules as the inbox list. Do not select FSRS. Do not log `q` or card fields.

**Addendum (impl-review 2026-09-13):** Cap detection uses exact count, not `.limit(1001)` + drop-the-extra-row. The probe row never arrives under `max_rows = 1000`. Honest-cap intent is unchanged: a 1001st match sets `capped: true`; an exact 1000 leaves `capped: false`.

### Success Criteria:

#### Automated Verification:

- Inbox `listFlashcards` orders `created_at` desc then `id` desc and still returns `Flashcard[]` with no cap
- Browse helper filters status and `word_phrase` before applying the 1000 cap and returns `{ cards, capped }`
- `src/types.ts` exports the browse result and status-filter types
- `npx astro sync` succeeds
- `npm run lint` succeeds
- `npm run build` succeeds

#### Manual Verification:

- `/dashboard` still lists every owned status, newest first; same-timestamp twins stay in the same order across refresh
- Browse helper with `status: "generated"` returns only generated rows for that user
- Non-empty `q` matches `word_phrase` case-insensitively and does not match on definition/cloze alone
- A 1001st matching row is omitted and `capped` is true; an exact 1000 matching rows leaves `capped` false
- User B’s client never returns user A’s rows

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: `/cards` catalog

### Overview

Add the protected browse page: URL-driven chips and find, the capped list, empty/load/cap copy, and the same per-card gate as the inbox.

### Changes Required:

#### 1. Protect the route

**File**: `src/lib/auth.ts`

**Intent**: Guests cannot keep or see a catalog; after sign-in they return to `/cards` (including query string).

**Contract**: Append `/cards` to `PROTECTED_ROUTES`. `isProtectedPath` already matches exact + prefix. Do not add a JSON `requireUser` list route.

#### 2. Cards page

**File**: `src/pages/cards.astro` (new)

**Intent**: Signed-in learners get a catalog that is not the paste inbox.

**Contract**: `createClient` + `locals.user`; call the browse helper with `userId`, `status`, and `q` parsed from `Astro.url.searchParams`. Allowed `status`: `generated` | `kept`; missing, empty, or anything else → `all`. `q` is the raw param trimmed; empty → no text filter. Missing client or a thrown load → `loadError`, `cards = []`, `capped = false` (do not crash the page). Pass `{ cards, capped, loadError, status, q }` into a `client:load` island. Page title “Cards”. Cosmic/`cn()` styling consistent with dashboard/review. Do not mount paste or `CreateFlashcard`. Do not add FSRS to the page.

#### 3. Filter chrome (SSR)

**File**: `src/pages/cards.astro`

**Intent**: Narrowing is shareable and works without the island.

**Contract**: Three chips — All, Generated, Kept — as GET links to `/cards` with `status` set (omit `status` on All) and the current `q` preserved. Mark the active chip (`aria-current="page"`). Find is a GET form to `/cards`: word/phrase input + submit, plus a hidden `status` when not All. Submitting an empty find clears `q`. No elapsed progress panel.

#### 4. Catalog island

**File**: `src/components/cards/BrowseFlashcards.tsx` (new)

**Intent**: The catalog is operable — leftovers found here can be gated here.

**Contract**: Reuse `FlashcardItem` with the same `onUpdated` / `onDeleted` list updates as `PasteGenerate`. Do not re-sort on the client. Cap note when `capped`: “Showing the newest 1000 cards.” (if a filter/find is active: “Showing the newest 1000 matching cards.”). `loadError` and empty list → dashboard load-error copy (“Cards could not be loaded. Refresh to try again.”) — never the empty-deck sentence. Empty deck (`all`, no `q`) → names generate and create by hand **on the dashboard**, with a link to `/dashboard`. Empty generated / empty kept / empty find each get distinct copy (not the empty-deck sentence). Merge classes with `cn()`. No `"use client"`. No env secrets.

### Success Criteria:

#### Automated Verification:

- `src/pages/cards.astro` exists and hydrates a `client:load` browse island
- `PROTECTED_ROUTES` includes `/cards`
- Filter chrome (status chips + word/phrase find) lives on `/cards`, not `/dashboard`
- Paste-generate and hand-create remain on `/dashboard` only
- `npx astro sync` succeeds
- `npm run lint` succeeds
- `npm run build` succeeds

#### Manual Verification:

- Guest `/cards` redirects to sign-in with `next` that returns them to `/cards` after sign-in; query string survives when present
- Default `/cards` is All, newest first; Generated / Kept chips narrow the list; All clears the status predicate
- Find matches `word_phrase` case-insensitively; a definition-only hit does not appear; empty find shows the unfiltered (or status-only) list
- Empty deck copy points at the dashboard; a chip or find with no matches is distinct from empty deck and from `loadError`
- Cap note appears only when more matching rows exist than 1000
- Accept / Edit / Delete / Un-keep on `/cards` match the inbox; refresh keeps the new status or absence
- Short actions do not freeze the page; a failed action shows an error on that card
- Signed in as user B, none of user A’s cards appear; B cannot mutate A’s rows

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Global Topbar

### Overview

One signed-in nav for Dashboard, Cards, and Review so browse is reachable from the inbox and from the end of a review session — without a third copy-pasted header cluster.

### Changes Required:

#### 1. Grow Topbar

**File**: `src/components/Topbar.astro`

**Intent**: Signed-in chrome is global nav, not a home-only Dashboard link.

**Contract**: Guest (home): keep Sign in / Sign up. Signed-in: email, links to `/dashboard`, `/cards`, `/review`, and Sign out. Set `aria-current="page"` on the link whose pathname matches. Merge classes with existing cosmic Topbar styling. Do not put paste, find, or card counts in the bar.

#### 2. Mount on product pages; strip duplicates

**Files**: `src/pages/dashboard.astro`; `src/pages/review.astro`; `src/pages/cards.astro`; `src/components/Welcome.astro` (already mounts Topbar — pick up the new links, no extra mount)

**Intent**: Identity and destinations live in one place; page headers stay titles.

**Contract**: Mount `Topbar` on `/dashboard`, `/review`, and `/cards` (same cosmic wrapper as home). Those page headers keep the page title and drop the in-header Dashboard / Review / Cards / Sign out cluster and the second email line. Do not mount Topbar on `/auth/signin`, `/auth/signup`, or `/auth/confirm-email`. Do not put Topbar into `Layout.astro` (that would hit auth pages). In-content CTAs may stay (review empty “Back to dashboard”).

### Success Criteria:

#### Automated Verification:

- Signed-in `Topbar` links to `/dashboard`, `/cards`, and `/review`
- `/dashboard`, `/review`, and `/cards` mount `Topbar`; auth pages do not
- Product page headers no longer duplicate those nav links or Sign out
- `npx astro sync` succeeds
- `npm run lint` succeeds
- `npm run build` succeeds

#### Manual Verification:

- From `/`, `/dashboard`, `/cards`, and `/review` (signed in), each of Dashboard / Cards / Review lands on the right page
- The current page’s Topbar link is indicated (`aria-current`)
- Guest home still shows Sign in / Sign up, not the product trio
- Sign out still clears the session from Topbar
- Guest `/cards` still redirects to sign-in
- Email and Sign out appear once per product page, not in both Topbar and the title card

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful.

---

## Testing Strategy

### Unit Tests:

- None. No test runner in this slice.

### Integration Tests:

- None in CI. Automated checks are `npx astro sync`, `npm run lint`, and `npm run build`.

### Manual Testing Steps:

1. Sign in as user A with a mix of generated leftovers and kept cards. Open `/cards` from Topbar — both statuses, newest first.
2. Click Generated — only leftovers. Click Kept — only kept. Click All — both again. Confirm the active chip.
3. Find a known `word_phrase` (wrong case) — that row remains; a card that only uses the lemma in the definition does not. Clear find — full (or status-only) list returns.
4. Accept one leftover on `/cards` → badge `kept`; refresh with Generated selected → it is gone from that chip, still on All / Kept.
5. Empty the find to a string that matches nothing — distinct empty copy, not load-error, not “no cards yet.”
6. Sign out from Topbar. Open `/cards` as guest → sign-in; after sign-in land back on `/cards`.
7. Sign in as user B — none of A’s cards; mutating an A id → 404 / no change.
8. Walk Topbar: Dashboard (paste + create still here, no browse chips), Cards, Review, and home. Current link indicated. Auth pages have no Topbar.
9. If a 1001-row fixture exists (or can be inserted locally), confirm the cap note and that the oldest matching row is omitted; with exactly 1000 matching, no note.

## Performance Considerations

One browse load is one filtered select of at most 1000 rows (`FLASHCARD_COLUMNS` only) plus an exact count on the same filter. `ilike` on `word_phrase` has no index — acceptable at handful-of-users / 1000-row cap. Do not add a `tsvector` or extra status index in this slice. Filter changes are full GET navigations; per-card actions stay one mutate `fetch` with a pending state, no elapsed panel.

## Migration Notes

No new migration. Hosted `flashcards` already has owner SELECT and `(user_id, created_at desc)`. Rollback is remove `/cards`, the Topbar product links, and the browse helper; revert inbox sort if desired. Existing rows stay valid. Inbox remains uncapped (PostgREST 1000 still applies there as today).

## References

- Roadmap S-06: `context/foundation/roadmap.md`
- PRD FR-007: `context/foundation/prd.md`
- Inbox list: `src/lib/services/list-flashcards.ts`
- Gate item: `src/components/cards/FlashcardItem.tsx`
- Auth / protected HTML: `src/lib/auth.ts`, `src/middleware.ts`
- S-01 inbox-not-browse: `context/changes/paste-generate-typical-use/plan.md`
- S-03 gate on dashboard: `context/changes/gate-generated-cards/plan.md`
- S-04 nav deferral: `context/changes/srs-review-session/plan.md`
- S-05 create stays on inbox: `context/changes/manual-card-create/plan.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Browse list query

#### Automated

- [x] 1.1 Inbox `listFlashcards` orders `created_at` desc then `id` desc and still returns `Flashcard[]` with no cap — 7c6addc
- [x] 1.2 Browse helper filters status and `word_phrase` before applying the 1000 cap and returns `{ cards, capped }` — 7c6addc
- [x] 1.3 `src/types.ts` exports the browse result and status-filter types — 7c6addc
- [x] 1.4 `npx astro sync` succeeds — 7c6addc
- [x] 1.5 `npm run lint` succeeds — 7c6addc
- [x] 1.6 `npm run build` succeeds — 7c6addc

#### Manual

- [x] 1.7 `/dashboard` still lists every owned status, newest first; same-timestamp twins stay in the same order across refresh — 7c6addc
- [x] 1.8 Browse helper with `status: "generated"` returns only generated rows for that user — 7c6addc
- [x] 1.9 Non-empty `q` matches `word_phrase` case-insensitively and does not match on definition/cloze alone — 7c6addc
- [x] 1.10 A 1001st matching row is omitted and `capped` is true; an exact 1000 matching rows leaves `capped` false — 7c6addc
- [x] 1.11 User B’s client never returns user A’s rows — 7c6addc

### Phase 2: `/cards` catalog

#### Automated

- [x] 2.1 `src/pages/cards.astro` exists and hydrates a `client:load` browse island — 63d3950
- [x] 2.2 `PROTECTED_ROUTES` includes `/cards` — 63d3950
- [x] 2.3 Filter chrome (status chips + word/phrase find) lives on `/cards`, not `/dashboard` — 63d3950
- [x] 2.4 Paste-generate and hand-create remain on `/dashboard` only — 63d3950
- [x] 2.5 `npx astro sync` succeeds — 63d3950
- [x] 2.6 `npm run lint` succeeds — 63d3950
- [x] 2.7 `npm run build` succeeds — 63d3950

#### Manual

- [ ] 2.8 Guest `/cards` redirects to sign-in with `next` that returns them to `/cards` after sign-in; query string survives when present
- [x] 2.9 Default `/cards` is All, newest first; Generated / Kept chips narrow the list; All clears the status predicate — 63d3950
- [x] 2.10 Find matches `word_phrase` case-insensitively; a definition-only hit does not appear; empty find shows the unfiltered (or status-only) list — 63d3950
- [x] 2.11 Empty deck copy points at the dashboard; a chip or find with no matches is distinct from empty deck and from `loadError` — 63d3950
- [ ] 2.12 Cap note appears only when more matching rows exist than 1000
- [x] 2.13 Accept / Edit / Delete / Un-keep on `/cards` match the inbox; refresh keeps the new status or absence — 63d3950
- [ ] 2.14 Short actions do not freeze the page; a failed action shows an error on that card
- [ ] 2.15 Signed in as user B, none of user A’s cards appear; B cannot mutate A’s rows

### Phase 3: Global Topbar

#### Automated

- [x] 3.1 Signed-in `Topbar` links to `/dashboard`, `/cards`, and `/review` — 60015c0
- [x] 3.2 `/dashboard`, `/review`, and `/cards` mount `Topbar`; auth pages do not — 60015c0
- [x] 3.3 Product page headers no longer duplicate those nav links or Sign out — 60015c0
- [x] 3.4 `npx astro sync` succeeds — 60015c0
- [x] 3.5 `npm run lint` succeeds — 60015c0
- [x] 3.6 `npm run build` succeeds — 60015c0

#### Manual

- [x] 3.7 From `/`, `/dashboard`, `/cards`, and `/review` (signed in), each of Dashboard / Cards / Review lands on the right page — 60015c0
- [x] 3.8 The current page’s Topbar link is indicated (`aria-current`) — 60015c0
- [x] 3.9 Guest home still shows Sign in / Sign up, not the product trio — 60015c0
- [x] 3.10 Sign out still clears the session from Topbar — 60015c0
- [x] 3.11 Guest `/cards` still redirects to sign-in — 60015c0
- [x] 3.12 Email and Sign out appear once per product page, not in both Topbar and the title card — 60015c0
