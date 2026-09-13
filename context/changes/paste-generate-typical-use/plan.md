# Paste and generate typical-use cloze cards Implementation Plan

## Overview

A signed-in learner pastes a word list or short text on `/dashboard`, receives typical-use cloze cards from OpenRouter, and keeps those rows on their account as `generated` (not yet kept for study). Empty and over-size pastes fail with an explanation. Generation shows a live progress panel for the single request. Accept/edit/delete, browse chrome, and SRS stay in later slices.

## Current State Analysis

S-02 left a session-honest auth contract: cookie SSR client, `PROTECTED_ROUTES` is `/dashboard`, JSON writes call `requireUser` (`src/lib/auth.ts`). Middleware already tells S-01 not to invent a second guest model (`src/middleware.ts`).

There is no card table, no `supabase/migrations/` directory, no `src/types.ts`, and no generate handler. `/dashboard` is a signed-in stub. `astro.config.mjs` only declares `SUPABASE_URL` / `SUPABASE_KEY`. shadcn has `Button` only; auth islands hydrate with `client:load` and merge classes with `cn()`.

S-03 will gate cards before they are kept for review. This slice therefore persists immediately with `status = generated` so a refresh still shows the cards, and leaves UPDATE/DELETE RLS in place for that later gate.

## Desired End State

From a signed-in `/dashboard`, the learner can paste a word list or a short paragraph, wait with a progress panel (status + elapsed), and see cloze cards that each have a gapped sentence, word/phrase, full sentence, short definition, collocation/pattern, and Polish translation. Those rows stay on their account across refresh. Another account never sees them. Trimmed-empty paste shows an explanatory empty-state. A paste over 4000 characters shows an explanatory error. A 20-item list yields at most 15 cards and a “first 15” note. Valid cards in a mixed model response are saved; invalid ones increment a failure count. Verify by walking generate, refresh, a second generate (accumulate), empty/over-size, and a two-account isolation check. Lint and build stay green.

### Key Discoveries:

- `requireUser` returns 401 JSON; HTML stays on middleware (`src/lib/auth.ts`, `src/middleware.ts`). Dashboard is already protected — no new `PROTECTED_ROUTES` entry if the UI stays on `/dashboard`.
- First table in the repo: create the migration with `npx supabase migration new create_flashcards`, then edit the file. Do not invent a timestamp by hand (Supabase skill).
- RLS policies must wrap `auth.uid()` in `(select auth.uid())` and index `user_id`. UPDATE later needs a SELECT policy or S-03 updates silently affect 0 rows.
- OpenRouter is `POST https://openrouter.ai/api/v1/chat/completions` with `Authorization`, `HTTP-Referer` + `X-Title`, and `response_format.json_schema`. Default model `openai/gpt-4o-mini` (supports `structured_outputs`, no mandatory reasoning). Use `fetch`, not an SDK — `workerd` Node subset.
- Workers Free CPU is 10 ms; waiting on OpenRouter/Supabase does not count. Sequential fetch-then-insert. Error 1102 in production means budget Workers Paid (`context/foundation/infrastructure.md`).
- HTTP duration is unlimited while the tab stays connected. Progress is client-owned for one request; no Durable Objects, no SSE.

## What We're NOT Doing

- Accept, edit, or delete UI (S-03). The `kept` status and UPDATE/DELETE policies exist so S-03 does not redesign the table.
- Browse/search/filter chrome (S-06). Dashboard lists the learner’s cards only so persist is visible.
- Manual card create (S-05).
- Ready-made SRS (S-04).
- Storing the raw paste (no generation-history table).
- Deduping word/phrase; each generate accumulates.
- Streaming cards, WebSockets, or Durable Objects.
- A test runner, labeled typical-use eval set, or chasing the 75% accept-rate secondary criteria.
- Passwordless, guest decks, file import, deck sharing.

## Implementation Approach

Keep the starter’s cookie session. Add `public.flashcards` with RLS so the existing SSR client (user JWT) is the only writer. Extract generation into `src/lib/services/` (OpenRouter + zod card parse + insert). `POST /api/cards/generate` validates the paste, calls the service, returns saved cards plus `failedCount` / `truncated`. Replace the dashboard stub with an SSR card list plus a React island for paste, progress, and the generate `fetch`. Prompt + required fields carry the typical-use bar; a human spot-checks two pastes.

## Critical Implementation Details

### Timing & lifecycle

Call OpenRouter to completion, then insert. Do not overlap those outbound calls while both are waiting on headers (Workers cap of six, and you must not persist unparsed output). Persist `user_id` from `locals.user.id` only — never from the JSON body.

### Performance constraints

Keep the generate handler to zod + one `fetch` + one insert. I/O wait is free on CPU; JSON parse of 15 cards plus SSR already competes with the Free 10 ms budget. If hosted generate returns 1102, that is a plan upgrade, not a prompt rewrite.

### State sequencing

The progress panel is entirely client-side for the in-flight `fetch`. The server returns one JSON body. Do not add a job table or stream to satisfy the NFR.

### Debug & observability

Do not log the paste, the model prompt, or `OPENROUTER_API_KEY`. Map OpenRouter/HTTP failures to stable copy. Missing key is a config-status banner plus a 503 on generate, same split as missing Supabase.

---

## Phase 1: Card schema and isolation

### Overview

Create the first product table, lock per-account RLS, and publish the card types S-03–S-06 will share. No generate UI yet.

### Changes Required:

#### 1. Flashcards migration

**File**: `supabase/migrations/<timestamp>_create_flashcards.sql` (created via `npx supabase migration new create_flashcards`)

**Intent**: Persist cloze cards on an account with a batch id and a generated-vs-kept status, without storing the paste.

**Contract**: Table `public.flashcards` with `id` (uuid pk, default `gen_random_uuid()`), `user_id` (uuid not null, `references auth.users(id) on delete cascade`), `generation_id` (uuid not null), `status` (`text` not null default `'generated'`, check in `('generated','kept')`), `cloze`, `word_phrase`, `full_sentence`, `definition`, `collocation_pattern`, `translation_pl` (all `text` not null), `created_at` (timestamptz not null default `now()`). Indexes: `user_id`, `(user_id, created_at desc)`, `(user_id, generation_id)`. Enable RLS. Four policies for `authenticated` only — SELECT / INSERT / UPDATE / DELETE — each using `(select auth.uid()) = user_id` (INSERT/UPDATE also `with check`). Revoke from `anon` / `public`; grant `select, insert, update, delete` to `authenticated`.

#### 2. Shared card types

**File**: `src/types.ts` (new)

**Intent**: Give API, island, and later slices one Flashcard shape so S-03 does not invent a second DTO.

**Contract**: Export `FlashcardStatus` (`"generated" | "kept"`), `Flashcard` (the columns above as camelCase strings / dates), and `GenerateCardsResponse` (`cards`, `failedCount`, `truncated`, `cap`).

### Success Criteria:

#### Automated Verification:

- `supabase/migrations/` contains a `create_flashcards` migration that enables RLS and four per-operation `authenticated` policies
- `src/types.ts` exports `Flashcard` and `FlashcardStatus`
- `npx astro sync` succeeds
- `npm run lint` succeeds
- `npm run build` succeeds

#### Manual Verification:

- Local apply succeeds (`npx supabase db reset` or `npx supabase migration up` against the running local stack)
- In Studio, `anon` cannot select `flashcards`; a row inserted as user A is not visible when queried as user B

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Generate API

### Overview

Add the live generation path: validate paste, call OpenRouter with a typical-use JSON schema, persist valid cards as `generated`, return the batch plus failure/truncation counts.

### Changes Required:

#### 1. Server env for OpenRouter

**Files**: `astro.config.mjs`, `.env.example`, `src/lib/config-status.ts`

**Intent**: Keep the API key server-only, same as Supabase, and show a banner when generate cannot run.

**Contract**: `OPENROUTER_API_KEY` and optional `OPENROUTER_MODEL` are `envField.string({ context: "server", access: "secret", optional: true })`. `.env.example` lists placeholders only (`###` / `openai/gpt-4o-mini`). `config-status` gains an OpenRouter row. Default model when unset: `openai/gpt-4o-mini`. Local values live in gitignored `.dev.vars`. Hosted: `npx wrangler secret put OPENROUTER_API_KEY` (human gate; not in git or `wrangler.jsonc` `vars`).

#### 2. Generation service

**File**: `src/lib/services/generate-cards.ts` (new)

**Intent**: One module owns the typical-use prompt, OpenRouter `fetch`, per-card zod parse, and insert of valid rows.

**Contract**:

- Input: `{ userId, paste }` already trimmed and length-checked by the route.
- One card per target item; persist at most **15**. If the model returns more, keep the first 15 in array order and set `truncated: true`. If it returns exactly 15, also set `truncated: true` (treat the cap as hit).
- Prompt: English L2 typical use (context, collocation, grammar pattern — not C1/C2 showpieces); Polish translation required; cloze uses `_____` for the gap; one generate path for lists and prose; “if more than 15 items, use the first 15 in input order.”
- `fetch` to `https://openrouter.ai/api/v1/chat/completions` with `Authorization: Bearer`, `HTTP-Referer` (current request origin), `X-Title: 10xUsage`, `response_format` `json_schema` for `{ cards: Card[] }` matching the six fields. `AbortSignal.timeout(55_000)`.
- Zod-parse each card independently. Insert only valid cards with one `generation_id` (`crypto.randomUUID()`), `status: "generated"`, `user_id: userId`. `failedCount` = invalid card objects. Entire OpenRouter/HTTP failure → throw a mapped error; insert nothing.
- Never persist `paste`.

#### 3. Generate route

**File**: `src/pages/api/cards/generate.ts` (new)

**Intent**: JSON write that refuses guests, rejects empty/over-size paste, and returns the persisted batch.

**Contract**: `export const prerender = false`. `POST` only. `requireUser(locals)` first (401). `createClient` missing → 503. Body JSON `{ paste: string }` via zod: trimmed string. Empty after trim → 400 `{ error, code: "empty_paste" }`. Length > **4000** → 400 `{ error, code: "paste_too_long", max: 4000 }`. On success → 200 `GenerateCardsResponse` (`cap: 15`). OpenRouter/config failures → 503 with stable copy. Do not put raw provider messages in the body.

### Success Criteria:

#### Automated Verification:

- `src/pages/api/cards/generate.ts` exports `const prerender = false`
- `npx astro sync` succeeds
- `npm run lint` succeeds
- `npm run build` succeeds

#### Manual Verification:

- Unauthenticated POST → 401; no rows inserted
- Signed-in POST of `"   "` → 400 `empty_paste`; no rows
- Signed-in POST of 4001 characters → 400 `paste_too_long`; no rows
- Signed-in POST of a 3-word list → 200, three `generated` rows for that user only, six fields each
- A mixed/invalid card from the model is omitted from the table and counted in `failedCount`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Dashboard paste and results

### Overview

Replace the dashboard stub with paste, a progress panel, and the learner’s persisted cards so generate, empty-state, and cross-session keep are visible in the first-session path.

### Changes Required:

#### 1. Dashboard data load

**File**: `src/pages/dashboard.astro`

**Intent**: Signed-in learners land on the generate surface with cards already on the account (refresh must not look empty after a successful generate).

**Contract**: Load cards with `createClient(Astro.request.headers, Astro.cookies)` ordered `created_at` desc. Pass them into the island. Keep sign-out. Do not add a new HTML route or a `PROTECTED_ROUTES` entry.

#### 2. Paste, progress, and card list island

**Files**: `src/components/cards/PasteGenerate.tsx` (new), `src/components/hooks/` as needed

**Intent**: One interactive surface for paste, the >2s progress NFR, empty/error copy, and the accumulated card list.

**Contract**:

- Textarea + Generate. Trimmed-empty submit shows an explanatory empty-state and does not `fetch`.
- While `fetch` to `/api/cards/generate` is in flight: disable the button; show a progress panel with a status line and elapsed time that updates at least once per second. Cards from this request appear together when the response arrives (not streamed).
- Render each card’s six fields. Newest first. A second generate prepends/accumulates; do not replace older rows.
- Show `failedCount` and the “first 15” note when `truncated`.
- After a full page load, SSR cards are visible without generating again.
- Match existing cosmic/`cn()` styling (auth `FormField` pattern). Do not read env secrets in the island.

#### 3. Isolation visible on the signed-in surface

**File**: same dashboard island / SSR load

**Intent**: FR-009 / NFR isolation is something a second account can see, not only a SQL check.

**Contract**: User B’s dashboard lists only B’s rows. No paste text from A appears anywhere.

### Success Criteria:

#### Automated Verification:

- `npx astro sync` succeeds
- `npm run lint` succeeds
- `npm run build` succeeds

#### Manual Verification:

- Empty paste shows explanatory empty-state; the screen does not freeze
- Generate shows the progress panel (status + elapsed) until the batch appears
- Cards show all six fields; refresh still shows them
- A second generate accumulates; a 20-item list shows 15 cards plus the first-15 note
- Typical-use spot-check: one word-list paste and one short-paragraph paste — cards teach context, collocation, and grammar pattern, not C1/C2 showpieces
- Signed in as user B, none of user A’s cards (or paste) appear

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- None. No test runner in this slice.

### Integration Tests:

- None in CI. Automated checks are `npx astro sync`, `npm run lint`, and `npm run build`.

### Manual Testing Steps:

1. Local Supabase up, `.dev.vars` has Supabase + `OPENROUTER_API_KEY`. Sign in as user A.
2. Open `/dashboard`. Submit empty / whitespace → explanatory empty-state, no network generate (or 400 if forced).
3. Paste `apple / banana / run` (or three lines) → progress panel → three cards with six fields. Refresh → still there.
4. Paste a short English paragraph that uses two of those words → more cards accumulate; older cards remain.
5. Paste twenty target words → at most 15 cards and the first-15 note.
6. Typical-use bar (both pastes from steps 3–4): each card has a natural gap, a collocation or pattern (not a definition-only line), and a Polish translation. Reject the slice if cards are literary/C1 showpieces or isolated translations with no context.
7. Sign out. Sign in as user B → dashboard has none of A’s cards.
8. Guest POST `/api/cards/generate` → 401.
9. Optional hosted: apply the migration to the hosted project, `wrangler secret put OPENROUTER_API_KEY`, smoke one generate on the Worker. If Error 1102, that is the Free CPU cap — do not paper over it in the prompt.

## Performance Considerations

One generate = one OpenRouter subrequest + one Supabase insert. Cap 15 cards and 4000 characters so completion stays interactive. Client progress keeps the tab connected (HTTP duration is unlimited while connected). Do not add parallel outbound calls. Measure hosted CPU on the first live generate (`wrangler tail` / observability).

## Migration Notes

First product table. Apply locally with the Supabase CLI. Hosted project `10xUsage` (`context/deployment/deploy-plan.md`) needs the same migration before production generate can persist. Rollback is `supabase db reset` locally; hosted rollback is a down migration or drop of `public.flashcards` only — it does not touch `auth.users`. Existing accounts keep working. No paste backfill. `status = generated` is the only value this slice writes; S-03 will set `kept`.

## References

- Roadmap S-01: `context/foundation/roadmap.md`
- PRD US-01, FR-002, FR-003, FR-004, FR-009, NFRs: `context/foundation/prd.md`
- Auth contract (S-02): `src/lib/auth.ts`, `src/middleware.ts`
- Workers limits: https://developers.cloudflare.com/workers/platform/limits/
- OpenRouter structured outputs + attribution headers: https://openrouter.ai/docs/guides/features/structured-outputs , https://openrouter.ai/docs/app-attribution
- S-03 (gate): `gate-generated-cards` — not this folder

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Card schema and isolation

#### Automated

- [x] 1.1 `supabase/migrations/` contains a `create_flashcards` migration that enables RLS and four per-operation `authenticated` policies — ca2a09f
- [x] 1.2 `src/types.ts` exports `Flashcard` and `FlashcardStatus` — ca2a09f
- [x] 1.3 `npx astro sync` succeeds — ca2a09f
- [x] 1.4 `npm run lint` succeeds — ca2a09f
- [x] 1.5 `npm run build` succeeds — ca2a09f

#### Manual

- [x] 1.6 Local apply succeeds (`npx supabase db reset` or `npx supabase migration up` against the running local stack) — ca2a09f
- [x] 1.7 In Studio, `anon` cannot select `flashcards`; a row inserted as user A is not visible when queried as user B — ca2a09f

### Phase 2: Generate API

#### Automated

- [x] 2.1 `src/pages/api/cards/generate.ts` exports `const prerender = false` — da61015
- [x] 2.2 `npx astro sync` succeeds — da61015
- [x] 2.3 `npm run lint` succeeds — da61015
- [x] 2.4 `npm run build` succeeds — da61015

#### Manual

- [x] 2.5 Unauthenticated POST → 401; no rows inserted — da61015
- [x] 2.6 Signed-in POST of `"   "` → 400 `empty_paste`; no rows — da61015
- [x] 2.7 Signed-in POST of 4001 characters → 400 `paste_too_long`; no rows — da61015
- [x] 2.8 Signed-in POST of a 3-word list → 200, three `generated` rows for that user only, six fields each — da61015
- [x] 2.9 A mixed/invalid card from the model is omitted from the table and counted in `failedCount` — da61015

### Phase 3: Dashboard paste and results

#### Automated

- [x] 3.1 `npx astro sync` succeeds
- [x] 3.2 `npm run lint` succeeds
- [x] 3.3 `npm run build` succeeds

#### Manual

- [x] 3.4 Empty paste shows explanatory empty-state; the screen does not freeze
- [x] 3.5 Generate shows the progress panel (status + elapsed) until the batch appears
- [x] 3.6 Cards show all six fields; refresh still shows them
- [x] 3.7 A second generate accumulates; a 20-item list shows 15 cards plus the first-15 note
- [x] 3.8 Typical-use spot-check: one word-list paste and one short-paragraph paste — cards teach context, collocation, and grammar pattern, not C1/C2 showpieces
- [x] 3.9 Signed in as user B, none of user A’s cards (or paste) appear
