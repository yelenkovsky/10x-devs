# Create a flashcard by hand Implementation Plan

## Overview

A signed-in learner can create one cloze flashcard by hand on `/dashboard`, with the same six fields as generated cards. The row is stored as `kept` (lazy FSRS) so it is due on `/review` without an Accept click. Empty-deck and empty-review copy name this path. Browse chrome stays S-06.

## Current State Analysis

S-01 persists cloze cards; S-03 gates them; S-04 reviews `kept` rows. The only insert is generate: one `generation_id` per batch, `status: "generated"`, FSRS omitted (`src/lib/services/generate-cards.ts:223-236`). `generation_id` is `uuid not null` with no default (`supabase/migrations/20260913152707_create_flashcards.sql:4`). There is no create API or “new card” control.

`POST /api/cards/:id` mutates an existing row (`keep` / `unkeep` / `edit` / `delete`). Edit and generate both require six trimmed non-empty fields; neither requires `_____` in cloze (`src/lib/services/mutate-flashcard.ts:13-20`, `src/lib/services/generate-cards.ts:26-33`). S-03 deferred a typical-use re-score on edit.

`/dashboard` SSR-loads every row newest-first and hydrates `PasteGenerate` (`src/pages/dashboard.astro:14,52`). Empty copy is generate-only (`PasteGenerate.tsx:247`). `/review` empty `no_kept` says to Accept first (`ReviewSession.tsx:11`). shadcn has `Button` only. No test runner.

S-04 already treats insert-as-kept with all-null FSRS as due, and said this slice must not invent a second `createEmptyCard` helper (`context/changes/srs-review-session/plan.md:279`).

## Desired End State

On `/dashboard`, a signed-in learner opens “Create a card by hand”, fills the six fields (with typical-use hints), and saves. The card appears at the top of the list as `kept`. The form clears and collapses. Refresh still shows it. Another account never sees it. A second card with the same word/phrase is allowed. `/review` shows that card when it is the next due kept row (null FSRS counts as due). Empty dashboard and empty review both mention creating by hand. Lint and build stay green.

Verify by curling create, walking the toggle/save/refresh path, opening `/review` with only that new card, repeating as user B, and spot-checking one or two hand-made cards against the typical-use bar.

### Key Discoveries:

- The only `.insert(` in `src/` is generate persist (`src/lib/services/generate-cards.ts:236`). Create needs a new write path; do not hang `action: "create"` on `POST /api/cards/:id` — there is no id yet.
- `generation_id` cannot be null. Mutate must never take it from the body (`context/changes/gate-generated-cards/plan.md:103`). Mint a fresh UUID on the server (batch of one).
- Keep/edit do not write FSRS. A partial FSRS row makes `toCardInput` throw (`src/lib/services/flashcard-fsrs.ts`). Omit the columns on insert so they stay all-null.
- Queue is `kept AND (due IS NULL OR due <= now)` (`src/lib/services/review-session.ts`). Insert-as-kept is study-ready immediately.
- `FLASHCARD_COLUMNS` and dashboard `Flashcard` stay content-only. Do not put FSRS on the create DTO.
- JSON writes: `requireUser`, `export const prerender = false`, uppercase `POST`, local `jsonResponse`. Verb route `/api/cards/generate` is the sibling to copy (`src/pages/api/cards/generate.ts`).
- Island `fetch` uses `credentials: "same-origin"` and zod-parses the response (`FlashcardItem.tsx:95-100`).

## What We're NOT Doing

- Browse/search/filter chrome (S-06).
- A new HTML route or a new `PROTECTED_ROUTES` entry.
- AI-fill / a second generate path on the form.
- Typical-use re-score, or requiring `_____` in cloze (stricter than edit).
- Deduping `word_phrase` or warning on a repeat lemma.
- `createEmptyCard()` on insert, or a backfill.
- Making `generation_id` nullable.
- Tabs, an always-visible six-field form, or a “create another” loop that keeps the form open.
- Navigating to `/review` after save.
- Changing generate insert, or adding FSRS fields to `Flashcard` / `FLASHCARD_COLUMNS`.
- A test runner, or chasing the 75% AI-created secondary criteria.

## Implementation Approach

Keep the cookie session and the existing table. Extract the six-field trim+min(1) zod so generate, edit, and create cannot drift. Add `createFlashcard` and `POST /api/cards/create`. Persist `user_id` from the session, mint `generation_id` on the server, write `status: "kept"`, omit FSRS columns. On `/dashboard`, put a collapsed create form next to paste; on success, prepend the card, clear and collapse. Update empty-state copy on the dashboard and on `/review`.

## Critical Implementation Details

### State sequencing

Insert `kept` with every FSRS column omitted (null). Do not call `createEmptyCard`. Un-keep on that row is the existing mutate path (`status: "generated"` + `FSRS_NULL_PATCH`). Keep/edit stay as they are.

### Timing & lifecycle

Mint `generation_id` with `crypto.randomUUID()` in the service. Never read `user_id` or `generation_id` from the JSON body. Insert then `.select(FLASHCARD_COLUMNS)` and map with `toFlashcard`. A real DB `error` is 503; do not use `.single()` as the emptiness check.

### User experience spec

The create form starts collapsed. Cancel hides it without writing. After a 200, prepend, clear every field, and collapse — one card per submit, not a stay-open loop. Typical-use hints are visible only while the form is open. Generate and other card actions stay usable while create is in flight; disable only the create submit.

---

## Phase 1: Create API

### Overview

Share the six-field schema, add a create service, and expose `POST /api/cards/create` so insert-as-kept can be curled without UI.

### Changes Required:

#### 1. Shared field schema

**Files**: `src/lib/services/flashcard-fields.ts` (new); `src/lib/services/generate-cards.ts`; `src/lib/services/mutate-flashcard.ts`

**Intent**: One trim+min(1) parse for the six cloze fields so generate, edit, and create cannot drift.

**Contract**: Export a zod object with `cloze`, `wordPhrase`, `fullSentence`, `definition`, `collocationPattern`, `translationPl` — each `z.string().trim().min(1)`. Generate’s per-card parse, mutate `edit`, and create all import it. Do not add a `_____` check.

#### 2. Create types

**File**: `src/types.ts`

**Intent**: Give the route, service, and later island one create contract.

**Contract**: Export `CreateFlashcardRequest` (the six camelCase fields) and `CreateFlashcardResponse` (`{ card: Flashcard }`). No `status`, `generationId`, `userId`, or FSRS on the request.

#### 3. Create service

**File**: `src/lib/services/create-flashcard.ts` (new)

**Intent**: Insert one owned row as `kept`, ready for lazy first review.

**Contract**:

- Input includes `userId` (from `locals.user.id` only), parsed fields, and `supabase`.
- Re-validate with the shared field schema. Failure → typed error, HTTP 400, `code: "invalid_fields"`, copy “All card fields are required.” (same idea as edit). Do not hit the database.
- Insert one row: `user_id: userId`, `generation_id: crypto.randomUUID()`, `status: "kept"`, the six snake_case columns. Do not set any FSRS column.
- `.select(FLASHCARD_COLUMNS)`. Real DB `error` → typed error, HTTP 503, stable copy (not `generation_unavailable`). Empty/unparsable `data` → 503, not 404.
- Return `{ card: Flashcard }` via `toFlashcard`. Do not log field values.

#### 4. Create route

**File**: `src/pages/api/cards/create.ts` (new)

**Intent**: JSON write that refuses guests and inserts one hand-made card.

**Contract**: `export const prerender = false`. `POST` only. `requireUser` first (401). Missing Supabase client → 503. Body is `CreateFlashcardRequest` via the shared field schema. Success: 200 `{ card: Flashcard }` (same status code as generate/mutate). Copy a local `jsonResponse` — do not extract a shared helper. Do not log card fields.

### Success Criteria:

#### Automated Verification:

- `src/pages/api/cards/create.ts` exports `const prerender = false` and `POST`
- `src/types.ts` exports `CreateFlashcardRequest`
- Generate, mutate edit, and create import the same six-field trim+min(1) schema (no third private copy)
- `npx astro sync` succeeds
- `npm run lint` succeeds
- `npm run build` succeeds

#### Manual Verification:

- Unauthenticated POST → 401; no row inserted
- Signed-in POST of six non-empty fields → 200, `status: "kept"`, six fields present, `generationId` is a UUID, all FSRS columns null
- Signed-in POST with a blank or whitespace-only field → 400; no row
- Signed-in second POST with the same word/phrase → 200; both rows exist
- Signed-in as user B, none of user A’s new card appears in B’s list

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Dashboard create UI and empty copy

### Overview

Put a collapsed six-field form on `/dashboard`, prepend on success, and name the path in empty dashboard and empty review copy.

### Changes Required:

#### 1. Shared field list

**Files**: `src/components/cards/card-fields.ts` (new); `src/components/cards/FlashcardItem.tsx`

**Intent**: One key/label/multiline list so create and edit cannot drift on field names or labels.

**Contract**: Export the six entries `FlashcardItem` already uses (`Cloze`, `Word / phrase`, `Full sentence`, `Definition`, `Collocation / pattern`, `Polish translation`, with the same multiline flags). `FlashcardItem` imports this list. Hints are not on this list — they belong on the create form only.

#### 2. Create form island

**File**: `src/components/cards/CreateFlashcard.tsx` (new)

**Intent**: Collapsed hand-create surface with typical-use hints and the same empty-field rules as edit.

**Contract**:

- Closed: a control labelled “Create a card by hand”. Open: the six fields plus Save / Cancel.
- Each field shows a short typical-use hint (everyday context, collocation/pattern, not a C1/C2 showpiece; cloze described as a sentence with `_____` for the target). Hints are guidance only — they do not add server rules.
- Client-side: trim; any empty field → “This field is required.” under that field; no `fetch`. Form `noValidate`.
- Save `POST /api/cards/create` with `credentials: "same-origin"` and zod-parse `{ card: Flashcard }` (same style as `FlashcardItem`).
- Success: call `onCreated(card)`, clear fields, collapse. Cancel: collapse without writing; discard the draft.
- While create `fetch` is in flight, disable Save / Cancel / fields; show a short pending state (no generate-style elapsed panel). Failure: keep the form open, show stable error copy on the form. Do not say “this is someone else’s card.”
- Merge classes with `cn()`. Reuse the edit input styling (error rings). `Button` only from shadcn. No `"use client"`. No env secrets.

#### 3. Wire into the dashboard list

**File**: `src/components/cards/PasteGenerate.tsx`

**Intent**: Create shares the inbox list with generate so prepend and refresh stay one source of truth.

**Contract**: Render `CreateFlashcard` next to the paste form (not a new page). `onCreated` prepends: `[card, ...current]`. Generate, load-error, and per-card actions stay as they are. Generate may run while the create form is open; do not block Generate on create pending (and vice versa).

#### 4. Empty-state copy

**Files**: `src/components/cards/PasteGenerate.tsx`; `src/components/cards/ReviewSession.tsx`

**Intent**: An empty deck and an empty review queue must mention hand-create, not only generate / Accept.

**Contract**: Dashboard empty copy (no cards, no load error) names both paste-generate and create by hand. `/review` `no_kept` copy names Accept **or** create by hand on the dashboard. `none_due` and `loadError` stay as they are. Keep the existing “Back to dashboard” link on the review empty state.

### Success Criteria:

#### Automated Verification:

- Create form lives on `/dashboard` (no new HTML route; `PROTECTED_ROUTES` unchanged)
- Review `no_kept` copy mentions creating a card by hand (not only Accept)
- `npx astro sync` succeeds
- `npm run lint` succeeds
- `npm run build` succeeds

#### Manual Verification:

- Empty dashboard mentions generate and create by hand
- Toggle opens the form; Cancel hides it without writing
- Empty / whitespace field shows “This field is required.” and does not `fetch`
- Save prepends a `kept` card, clears and collapses the form, stays on `/dashboard`
- Typical-use hints are visible on the open form
- Refresh still shows the card as `kept`
- `/review` with only this new kept card (null FSRS) shows it; `no_kept` copy mentions create by hand when there are no kept cards
- Short action does not freeze the page; a failed create shows an error on the form
- Signed in as user B, none of user A’s cards appear
- Typical-use spot-check: one or two hand-made cards teach context, collocation, and grammar pattern — not C1/C2 showpieces

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- None. No test runner in this slice.

### Integration Tests:

- None in CI. Automated checks are `npx astro sync`, `npm run lint`, and `npm run build`.

### Manual Testing Steps:

1. Sign in as user A. On an empty dashboard, confirm copy mentions generate and create by hand.
2. Open “Create a card by hand”. Confirm typical-use hints. Cancel → form hidden, no row.
3. Open again. Leave one field blank → inline required, no network create.
4. Fill six typical-use fields (everyday gap, collocation/pattern, Polish). Save → card prepends as `kept`; form clears and collapses.
5. Refresh → same card still `kept`.
6. Create a second card with the same word/phrase → both rows exist.
7. Open `/review` with no other kept cards → the new card is due (cloze first).
8. Un-keep that card on the dashboard → `/review` `no_kept` mentions create by hand (or Accept).
9. Sign in as user B → none of A’s cards; guest `POST /api/cards/create` → 401.
10. Spot-check the hand-made cards from steps 4 and 6 against the typical-use bar. Reject the slice if they are literary/C1 showpieces or isolated translations with no context.

## Performance Considerations

One create is one Supabase insert. No OpenRouter call. Stay under the NFR: acknowledge without a frozen screen; a per-submit pending state is enough — do not add a generate-style elapsed panel.

## Migration Notes

No new migration. `generation_id` stays `NOT NULL`; the service supplies a UUID. Hosted `flashcards` already has INSERT RLS and nullable FSRS columns. Rollback is remove the route/UI; existing rows stay valid. A hand-made `kept` row with null FSRS is already a legal queue member.

## References

- Roadmap S-05: `context/foundation/roadmap.md`
- PRD US-01, FR-006, Business Logic (same typical-use bar): `context/foundation/prd.md`
- S-01 persist + six fields: `context/changes/paste-generate-typical-use/plan.md`
- S-03 edit validation / no re-score: `context/changes/gate-generated-cards/plan.md`
- S-04 lazy insert-as-kept: `context/changes/srs-review-session/plan.md`
- Auth / JSON writes: `src/lib/auth.ts`, `src/pages/api/cards/generate.ts`
- Island fetch pattern: `src/components/cards/FlashcardItem.tsx`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Create API

#### Automated

- [x] 1.1 `src/pages/api/cards/create.ts` exports `const prerender = false` and `POST` — 6fc355d
- [x] 1.2 `src/types.ts` exports `CreateFlashcardRequest` — 6fc355d
- [x] 1.3 Generate, mutate edit, and create import the same six-field trim+min(1) schema (no third private copy) — 6fc355d
- [x] 1.4 `npx astro sync` succeeds — 6fc355d
- [x] 1.5 `npm run lint` succeeds — 6fc355d
- [x] 1.6 `npm run build` succeeds — 6fc355d

#### Manual

- [x] 1.7 Unauthenticated POST → 401; no row inserted
- [x] 1.8 Signed-in POST of six non-empty fields → 200, `status: "kept"`, six fields present, `generationId` is a UUID, all FSRS columns null
- [x] 1.9 Signed-in POST with a blank or whitespace-only field → 400; no row
- [x] 1.10 Signed-in second POST with the same word/phrase → 200; both rows exist
- [x] 1.11 Signed-in as user B, none of user A’s new card appears in B’s list

### Phase 2: Dashboard create UI and empty copy

#### Automated

- [x] 2.1 Create form lives on `/dashboard` (no new HTML route; `PROTECTED_ROUTES` unchanged)
- [x] 2.2 Review `no_kept` copy mentions creating a card by hand (not only Accept)
- [x] 2.3 `npx astro sync` succeeds
- [x] 2.4 `npm run lint` succeeds
- [x] 2.5 `npm run build` succeeds

#### Manual

- [x] 2.6 Empty dashboard mentions generate and create by hand
- [x] 2.7 Toggle opens the form; Cancel hides it without writing
- [x] 2.8 Empty / whitespace field shows “This field is required.” and does not `fetch`
- [x] 2.9 Save prepends a `kept` card, clears and collapses the form, stays on `/dashboard`
- [x] 2.10 Typical-use hints are visible on the open form
- [x] 2.11 Refresh still shows the card as `kept`
- [x] 2.12 `/review` with only this new kept card (null FSRS) shows it; `no_kept` copy mentions create by hand when there are no kept cards
- [x] 2.13 Short action does not freeze the page; a failed create shows an error on the form
- [x] 2.14 Signed in as user B, none of user A’s cards appear
- [x] 2.15 Typical-use spot-check: one or two hand-made cards teach context, collocation, and grammar pattern — not C1/C2 showpieces
