# Gate generated cards Implementation Plan

## Overview

A signed-in learner can accept, edit, or delete each generated flashcard on `/dashboard`, and can edit, delete, or un-keep a card after it is kept. Status is the only study signal this slice writes. Leftover `generated` rows stay visible until the learner acts. Ready-made SRS stays in S-04.

## Current State Analysis

S-01 shipped `public.flashcards` with `status` in `('generated','kept')`, owner-only SELECT/INSERT/UPDATE/DELETE RLS, and inserts that always write `generated` (`supabase/migrations/20260913152707_create_flashcards.sql`, `src/lib/services/generate-cards.ts`). `/dashboard` SSR-loads every row newest-first via `listFlashcards` and hydrates `PasteGenerate` with `client:load`. `FlashcardItem` is read-only and does not show `status`. There is no card mutation route.

`requireUser` is the JSON write contract (`src/lib/auth.ts`). The only card API is `POST /api/cards/generate`. `toFlashcard` / `flashcardRowSchema` are duplicated in generate and list. shadcn has `Button` only. No test runner.

S-04 research asks for `createEmptyCard()` on accept; this slice does **not** add scheduler columns. Un-keep is a status flip back to `generated`. Review must keep ignoring `generated` until S-04 exists.

## Desired End State

On `/dashboard`, every card shows `generated` or `kept`. A generated card can be kept in one click, edited (save keeps it), or deleted. A kept card can be edited (save stays kept), deleted, or returned to `generated`. Cards the learner does not touch stay `generated` and remain on the list after refresh. Another account cannot read or mutate these rows. Short actions acknowledge without freezing the page. Lint and build stay green.

### Key Discoveries:

- UPDATE/DELETE RLS already exists; S-01 warned that a 0-row update is a silent miss unless the write `.select()`s (`context/changes/paste-generate-typical-use/plan.md`).
- `AGENTS.md` requires uppercase `GET`/`POST` on API routes. Astro 6 also allows `PATCH`/`DELETE`; this slice stays on `POST` with an `action` discriminator so it matches generate and the repo rule.
- `output: "server"` plus `export const prerender = false` is the existing card-route pattern. Dynamic `src/pages/api/cards/[id].ts` is valid Astro (`params.id`); this repo has no `[param]` pages yet.
- Generate and list each own a private row mapper. A third copy in mutate would drift — extract once.
- `PasteGenerate` already takes `loadError` from dashboard SSR. Gate UI must keep that empty-state split.

## What We're NOT Doing

- FSRS / `ts-fsrs` columns, `createEmptyCard()`, or review (`srs-review-session`).
- Batch keep (this batch or all generated).
- Browse/search/filter chrome (S-06).
- Manual card create (S-05).
- Typical-use re-score or a `_____` cloze check on edit.
- A new HTML route or a new `PROTECTED_ROUTES` entry.
- Deduping `word_phrase`, storing the paste, or chasing the 75% accept-rate secondary criteria.
- A test runner.

## Implementation Approach

Keep the cookie session and the existing table. Extract the shared flashcard row mapper. Add one authenticated JSON `POST /api/cards/:id` that keeps, un-keeps, edits, or deletes a single row the session owns. Extend the dashboard island so each card can run those actions and show status. Persist `user_id` from the session only.

## Critical Implementation Details

### State sequencing

Save on a `generated` card always writes `kept` (edit is the accept path for a changed card). Save on a `kept` card updates fields and leaves `status` as `kept`. The only write that sets `generated` after insert is `action: "unkeep"`. Do not infer un-keep from an edit body. `keep` on an already-kept row and `unkeep` on an already-generated row are no-ops that return the current row.

### Timing & lifecycle

Card writes use `.update` / `.delete` plus `.eq("id", id).select()`. A PostgREST/RLS miss is `error: null` and empty `data` — map that to 404, same as an unknown id. Do not treat it as 503. Do not use `.single()` as the only emptiness check: 0 rows become `PGRST116`, which a generate-style `if (error) throw` would mis-map to 503.

---

## Phase 1: Card mutation API

### Overview

Share the flashcard row mapper, add a mutate service, and expose one JSON route so keep / un-keep / edit / delete can be verified without UI.

### Changes Required:

#### 1. Shared row mapper

**Files**: `src/lib/services/flashcard-row.ts` (new); `src/lib/services/generate-cards.ts`; `src/lib/services/list-flashcards.ts`

**Intent**: One parse/map for `flashcards` rows so generate, list, and mutate cannot drift.

**Contract**: Export the column list, `flashcardRowSchema`, and `toFlashcard`. Generate keeps fail-closed on insert parse. List keeps skip-invalid. Mutate will fail-closed on the single returned row.

#### 2. Mutate types

**File**: `src/types.ts`

**Intent**: Give the route, service, and later island one mutate contract.

**Contract**: Export a discriminated request plus two response shapes: success-with-card (keep / un-keep / edit) and success-with-id (delete). Field names stay camelCase, matching `Flashcard`.

```ts
export type MutateFlashcardRequest =
  | { action: "keep" }
  | { action: "unkeep" }
  | { action: "delete" }
  | {
      action: "edit";
      cloze: string;
      wordPhrase: string;
      fullSentence: string;
      definition: string;
      collocationPattern: string;
      translationPl: string;
    };
```

#### 3. Mutate service

**File**: `src/lib/services/mutate-flashcard.ts` (new)

**Intent**: Own keep, un-keep, edit, and delete against the session-scoped SSR client.

**Contract**:

- Input includes `userId` (from `locals.user.id` only), `id`, parsed `MutateFlashcardRequest`, and `supabase`.
- Never write `user_id` or `generation_id` from the body.
- `keep` → `status: "kept"`. `unkeep` → `status: "generated"`. `edit` → six trimmed fields with `min(1)`; if the row is `generated`, also set `kept`; if `kept`, leave `kept`. `delete` → remove the row.
- Real DB `error` → typed error, HTTP 503, stable copy (not `generation_unavailable`).
- 0 rows after `.select()` → typed error, HTTP 404, `code: "not_found"`.
- Edit that fails field validation → typed error, HTTP 400 (do not hit the database).

#### 4. Card-by-id route

**File**: `src/pages/api/cards/[id].ts` (new)

**Intent**: JSON write that refuses guests and applies one action to one owned card.

**Contract**: `export const prerender = false`. `POST` only. `requireUser` first (401). Missing Supabase client → 503. `params.id` must be a UUID (400 otherwise). Body is `MutateFlashcardRequest` via zod. Success: 200 `{ card: Flashcard }` for keep / un-keep / edit; 200 `{ id }` for delete. Copy generate’s local `jsonResponse` — do not extract a shared helper in this slice. Do not log card fields.

### Success Criteria:

#### Automated Verification:

- `src/pages/api/cards/[id].ts` exports `const prerender = false` and `POST`
- `src/types.ts` exports `MutateFlashcardRequest`
- Generate and list import the shared row mapper (no third private copy of `toFlashcard`)
- `npx astro sync` succeeds
- `npm run lint` succeeds
- `npm run build` succeeds

#### Manual Verification:

- Unauthenticated POST → 401; no row change
- Signed-in `keep` on a `generated` row → 200, `status: "kept"`
- Signed-in `keep` on an already-kept row → 200, still `kept` (idempotent)
- Signed-in `unkeep` on a `kept` row → 200, `status: "generated"`
- Signed-in `edit` on a `generated` row with six non-empty fields → 200, new fields, `status: "kept"`
- Signed-in `edit` on a `kept` row → 200, new fields, still `kept`
- Signed-in `edit` with a blank field → 400; row unchanged
- Signed-in `delete` → 200 `{ id }`; refresh list no longer includes the row
- Signed-in as user B, POST user A’s id → 404; A’s row unchanged
- Unknown UUID → 404

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Dashboard gate UI

### Overview

Show generated vs kept on the existing list and let the learner run the four actions per card, including leftover cards from earlier generates.

### Changes Required:

#### 1. Extract card item

**Files**: `src/components/cards/FlashcardItem.tsx` (new); `src/components/cards/PasteGenerate.tsx`

**Intent**: Keep paste + list state in `PasteGenerate`; give the card its own actions and edit form so the island stays readable.

**Contract**: `PasteGenerate` still owns `cards` / `setCards`, generate prepend, `loadError`, and the empty-deck copy. The item receives one `Flashcard` and reports the updated card, or a deleted id, back to the list. Merge classes with `cn()`. Do not read env secrets in the island.

#### 2. Status and per-card actions

**File**: `src/components/cards/FlashcardItem.tsx`

**Intent**: Make the gate visible and operable on every card on the dashboard list.

**Contract**:

- Show `generated` vs `kept` on every card.
- Generated: Accept (`keep`), Edit, Delete.
- Kept: Edit, Delete, Un-keep (`unkeep`).
- Actions appear on every generated card, any `generationId` — not only the latest batch.
- Accept is one click (no form). Un-keep is one click. Delete is two steps on the card (Delete, then Confirm); no new shadcn Dialog.
- While a card’s `fetch` is in flight, disable that card’s actions; other cards and Generate stay usable. Acknowledge success by updating the list (or removing a deleted row) without a full-page freeze.
- Per-card error copy on failure; 404 uses the same “not found” idea as the API (do not say “this is someone else’s card”).
- `fetch` `POST /api/cards/${id}` with `credentials: "same-origin"` and zod-parse the response, same style as generate.

#### 3. Inline edit

**File**: `src/components/cards/FlashcardItem.tsx`

**Intent**: Let the learner change the six fields in place, with save meaning keep-if-generated and stay-kept-if-kept.

**Contract**: Edit opens an inline form for the six fields (textarea/input, `cn()` error rings like the paste field). Save sends `action: "edit"` with trimmed values. Client-side empty field → inline error, no fetch. Server 400 → show the stable error. Cancel closes the form without writing. Saving a generated card must result in `kept` in the list; saving a kept card must remain `kept`.

### Success Criteria:

#### Automated Verification:

- `npx astro sync` succeeds
- `npm run lint` succeeds
- `npm run build` succeeds

#### Manual Verification:

- Each card shows generated or kept; Accept keeps a generated card in one click
- Edit + Save on a generated card updates fields and shows kept
- After accepting 2 of 15, the other 13 stay generated on the list and after refresh
- Edit + Save on a kept card updates fields and stays kept
- Un-keep returns a kept card to generated; Accept / Edit / Delete return
- Delete asks for confirm, then removes the card; refresh does not bring it back
- A second generate’s older generated cards still have Accept / Edit / Delete
- Short actions do not freeze the page; a failed action shows an error on that card
- Signed in as user B, none of user A’s cards appear; B cannot change A’s rows

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- None. No test runner in this slice.

### Integration Tests:

- None in CI. Automated checks are `npx astro sync`, `npm run lint`, and `npm run build`.

### Manual Testing Steps:

1. Sign in as user A with existing `generated` cards (or generate a 3-word list).
2. Accept one card → badge becomes kept; refresh still kept.
3. Edit a second generated card, change two fields, Save → kept with new copy.
4. Leave the third generated; refresh → still generated.
5. Edit the kept card from step 2, Save → fields change, still kept.
6. Un-keep that card → generated again; Accept works a second time.
7. Delete a generated card (confirm) → gone after refresh.
8. Generate again; older leftover generated cards still have actions.
9. Sign in as user B → none of A’s cards; curling A’s id as B returns 404.
10. Guest POST `/api/cards/<id>` → 401.

## Performance Considerations

Each action is one Supabase row write. No OpenRouter call. Stay under the NFR: acknowledge without a frozen screen; these writes should finish well under two seconds, so a per-card pending state is enough — do not add a generate-style elapsed panel.

## Migration Notes

No new migration. Hosted `flashcards` already has UPDATE/DELETE policies. Rollback is remove the route/UI; existing `generated` / `kept` rows stay valid. S-04 must still ignore `generated` and must reset any future scheduler state if it later sees an un-keep.

## References

- Roadmap S-03: `context/foundation/roadmap.md`
- PRD US-01, FR-005: `context/foundation/prd.md`
- S-01 persist + `kept` reservation: `context/changes/paste-generate-typical-use/plan.md`
- S-04 must ignore `generated`; FSRS init deferred: `context/changes/srs-review-session/research.md`
- Auth / JSON writes: `src/lib/auth.ts`, `src/pages/api/cards/generate.ts`
- Astro endpoints (dynamic params, HTTP methods): https://docs.astro.build/en/guides/endpoints/

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Card mutation API

#### Automated

- [x] 1.1 `src/pages/api/cards/[id].ts` exports `const prerender = false` and `POST` — 1cfa6c6
- [x] 1.2 `src/types.ts` exports `MutateFlashcardRequest` — 1cfa6c6
- [x] 1.3 Generate and list import the shared row mapper (no third private copy of `toFlashcard`) — 1cfa6c6
- [x] 1.4 `npx astro sync` succeeds — 1cfa6c6
- [x] 1.5 `npm run lint` succeeds — 1cfa6c6
- [x] 1.6 `npm run build` succeeds — 1cfa6c6

#### Manual

- [ ] 1.7 Unauthenticated POST → 401; no row change
- [ ] 1.8 Signed-in `keep` on a `generated` row → 200, `status: "kept"`
- [ ] 1.9 Signed-in `keep` on an already-kept row → 200, still `kept` (idempotent)
- [ ] 1.10 Signed-in `unkeep` on a `kept` row → 200, `status: "generated"`
- [ ] 1.11 Signed-in `edit` on a `generated` row with six non-empty fields → 200, new fields, `status: "kept"`
- [ ] 1.12 Signed-in `edit` on a `kept` row → 200, new fields, still `kept`
- [ ] 1.13 Signed-in `edit` with a blank field → 400; row unchanged
- [ ] 1.14 Signed-in `delete` → 200 `{ id }`; refresh list no longer includes the row
- [ ] 1.15 Signed-in as user B, POST user A’s id → 404; A’s row unchanged
- [ ] 1.16 Unknown UUID → 404

### Phase 2: Dashboard gate UI

#### Automated

- [ ] 2.1 `npx astro sync` succeeds
- [ ] 2.2 `npm run lint` succeeds
- [ ] 2.3 `npm run build` succeeds

#### Manual

- [ ] 2.4 Each card shows generated or kept; Accept keeps a generated card in one click
- [ ] 2.5 Edit + Save on a generated card updates fields and shows kept
- [ ] 2.6 After accepting 2 of 15, the other 13 stay generated on the list and after refresh
- [ ] 2.7 Edit + Save on a kept card updates fields and stays kept
- [ ] 2.8 Un-keep returns a kept card to generated; Accept / Edit / Delete return
- [ ] 2.9 Delete asks for confirm, then removes the card; refresh does not bring it back
- [ ] 2.10 A second generate’s older generated cards still have Accept / Edit / Delete
- [ ] 2.11 Short actions do not freeze the page; a failed action shows an error on that card
- [ ] 2.12 Signed in as user B, none of user A’s cards appear; B cannot change A’s rows
