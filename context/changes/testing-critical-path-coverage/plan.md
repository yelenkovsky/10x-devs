# Critical-path coverage Implementation Plan

## Overview

Bootstrap Vitest for this Astro 6 SSR app and add the first unit + integration suite that proves account isolation (Risk #1) and generate failure/persist contracts (Risks #2 and #3). The suite is the cheapest signal that User A never sees User B’s cards, that a slow or failed generate cannot look like a save, and that a successful generate is visible on a **new** list fetch — without a live model, Playwright, or a Workers harness.

## Current State Analysis

There is no runner and no `*.test.*` files. CI (`.github/workflows/ci.yml`) runs `astro sync`, lint, and build only. Stryker already names a Vitest runner; `vitest@5.0.0` exists only as a lockfile peer.

Isolation is **RLS on `flashcards` plus a cookie-scoped anon SSR client**, not “a session exists.” `requireUser` is session-existence only (`src/lib/auth.ts:121-129`). Dashboard `listFlashcards` has **no** `.eq("user_id")` (`src/lib/services/list-flashcards.ts:38-43`); browse and review add an app-level owner predicate on top of RLS. Paste is request-scoped: generate body `{ paste }` only, no paste column, island `useState`.

Generate is one `POST /api/cards/generate` → `generateCards` → OpenRouter `fetch` with `AbortSignal.timeout(55_000)` → validate ≤15 cards → `persistValidCards` → HTTP **200**. Progress is a client `role="status"` panel for the whole in-flight `fetch`, not a >2s gate. Persist runs only after the model call succeeds. `200` + `cards: []` is a current empty-success path. The dashboard island prepends the generate JSON and does **not** refetch; refresh is SSR `listFlashcards`. Review is `kept` + due only — empty review after generate is expected.

Local `npm run dev` is already workerd. Phase 1 Vitest uses `environment: "node"`. That does not prove workerd, Free-plan 10 ms CPU / Error 1102, or HTTP Worker wall-clock (HTTP Workers have no duration limit while the client stays connected; checked via research + official Workers limits, 2026). `supabase/seed.sql` is missing; local Auth has `enable_confirmations = false`, so two `signUp`s can create sessions. CI has no Docker/Supabase — Phase 3 of the test rollout wires the gate; this change must not claim GitHub Actions proves isolation.

Frame / interview leftovers that research already settled: “HTTP 201 means the deck is populated” is wrong (it is 200); “local Node app vs Worker” is the wrong Node≠Worker challenge (it is Vitest `node` ≠ workerd).

## Desired End State

`npm test` runs Vitest via Astro `getViteConfig()`. A developer with local Supabase up can prove:

1. User A’s inbox, browse, and review never contain User B’s card **ids** (and B-only fixture phrases); generate under A’s JWT cannot persist `user_id = B`; list DTOs have no paste field and `flashcards` has no paste column.
2. While generate is in flight, the island shows status + elapsed; timeout / model 5xx / invalid JSON return a clean failure, do not prepend cards, and leave A’s deck unchanged.
3. After a mocked-model generate that returns two fixture cards, a **new** `listFlashcards` / `listBrowseFlashcards` for A contains those fixture phrases; B’s new list does not. `200` + `cards: []` (empty envelope or all-invalid candidates) leaves A’s list count unchanged. Review is not used as the persist oracle.

`context/foundation/test-plan.md` §6.1, §6.2, §6.4, and §6.5 describe how to add the next test. §7 exclusions stay. Product generate behavior (including empty-200) is unchanged.

### Key Discoveries:

- Inbox isolation is 100% JWT + RLS; asserting `.eq("user_id")` on `listFlashcards` is a false filter copy (`src/lib/services/list-flashcards.ts:38-43`).
- Browse/review `.eq("user_id", input.userId)` does **not** prove RLS: if only RLS is bypassed, A can still see B on the dashboard (`dashboard.astro` never reads `locals.user` for the query).
- `word_phrase` is not unique (`supabase/migrations/20260913152707_create_flashcards.sql`). Isolation oracles must use B’s **ids**; shared phrases are legal.
- `getReviewSession` only returns `status = "kept"` with `due` null or `<= now` (`src/lib/services/review-session.ts:120-126`). Generate inserts `status: "generated"`. Review after generate is the wrong persist oracle.
- Progress has no `if (ms > 2000)` branch (`src/components/cards/PasteGenerate.tsx:188-200`, `src/components/hooks/useElapsedSeconds.ts`).
- Island `fetch` has no `AbortSignal`; only OpenRouter does (`generate-cards.ts:169-175`). A hung persist leaves `isGenerating` true — out of Phase 1 except as “do not unit a 2s gate.”
- `persistValidCards` treats empty insert `data` as success (`generate-cards.ts:211-238`); `createFlashcard` does not (`create-flashcard.ts:53-55`). Empty RETURNING after a claimed-ok insert would 200-empty **then show rows on refresh** — the opposite of Risk #3. Do not use that path as the persist-success oracle.
- `getViteConfig()` on `vitest run` takes the Astro **build** path and still loads `adapter: cloudflare()` (`astro.config.mjs:58`). That is the #15878-class crash vector. Isolation/persist tests do not need `experimental_AstroContainer`.
- Official Astro testing path: `getViteConfig()` from `astro/config`; Astro 6 Container/`.astro` tests need `environment: "node"` (Context7 `/withastro/docs`, checked 2026-09-13). `getViteConfig()` accepts an optional second `inlineAstroConfig` argument.

## What We're NOT Doing

- Playwright, browser e2e, or cursor-ide-browser as a CI/oracle layer (AI-native browser checked 2026-09-13 — agent smoke only, not this suite).
- Calling the live OpenRouter model.
- Adding `@cloudflare/vitest-plugin` / pool-workers, or proving workerd / Error 1102 / 55s wall-clock.
- Changing product code to fail-closed on `200` + `cards: []` or empty RETURNING.
- Wiring `npm test` into GitHub Actions (test-plan §3 Phase 3).
- Risks #4 (IDOR mutate), #5 (guest persist / bind-after-signup beyond one generate 401), #6 (grade-queue).
- Stryker / mutation score, landing/marketing chrome, typical-use prose quality, shadcn primitives.
- In-memory RLS simulators, mocking `supabase.from().select()` as the isolation oracle, or `expect(list).toEqual(toFlashcard(inserted))`.
- Committing `supabase/seed.sql` or using a service-role key as the test client.
- Rendering `.astro` pages in jsdom; using review empty-after-generate as persist success.
- Treating “User B’s paste appears in User A’s list” as an oracle (paste is not stored).

## Implementation Approach

Cost × signal, then risk priority: runner first (unblocks everything), then the cheapest Risk #2 units (no DB), then Risk #1 against real RLS (fail the suite if Postgres is down), then Risk #2 generate failure using that same two-user DB, then Risk #3 persist-then-list + lock empty-200, then write §6 so the next contributor copies the patterns.

Call **services** with two `@supabase/supabase-js` clients authenticated as A and B (anon/publishable key, `signUp`; local confirmations are off). Do not use Astro Container for isolation/persist. Mock `fetch` only when the URL is the OpenRouter chat-completions endpoint; **pass through** every other `fetch` (supabase-js uses `fetch`). Fixture phrases are independent of `toFlashcard`. Isolation asserts **ids** (and B-only phrases as extra), never “the string cat leaked.”

## Critical Implementation Details

**Fetch mock vs the data store.** A global `fetch` stub that swallows all URLs will mock Supabase and recreate the Risk #1 anti-pattern. Intercept only `https://openrouter.ai/api/v1/chat/completions`; delegate everything else to the real `fetch`.

**Review isolation is not the RLS-only inbox test.** `getReviewSession({ userId: A })` still `.eq("user_id", A)`, so it stays empty for A even if RLS is off. Seed B with a kept+due card (null `due` counts as due) so the check is non-vacuous, and **also** call the helper with A’s JWT and `userId: B` — A must not see B’s row. That probes RLS on the review SELECT instead of asserting a filter copy. The dashboard `listFlashcards(A)` call remains the load-bearing “logged in ≠ owns the row” test.

**Do not wait 55 seconds.** Prove timeout mapping by rejecting the OpenRouter `fetch` with an `Error` whose `name` is `TimeoutError`. Optionally assert the call was passed an `AbortSignal`. `AbortError` is a boundary: current code maps it to `generation_unavailable` (still 503, still no persist).

**Empty RETURNING is the opposite symptom.** If insert `data` is `[]` with `error: null`, generate returns 200 + `cards: []` and a later list **can** show rows. Do not treat that shape as the Risk #3 happy path. Lock empty-model and all-invalid (no insert) as 200 + unchanged list.

**Vitest `node` loads the Cloudflare adapter.** If `vitest run` crashes (`exports is not defined` / `#15847`, or `resolve.external` / `#15878`), apply the documented fallback (filter `astro:server`, or `getViteConfig`’s second argument to override `adapter` for the test config only). Record which fallback shipped in Phase 6. Do not add a Node adapter to production `astro.config.mjs`.

---

## Phase 1: Bootstrap Vitest

### Overview

Declare Vitest and make `npm test` a real, green command on this Astro 6 + Cloudflare repo. No product tests yet — only enough config and a smoke file to prove the runner starts.

### Changes Required:

#### 1. Declare the runner

**File**: `package.json`

**Intent**: Make Vitest a first-class dependency with `test` / `test:watch` scripts so the lockfile peer is not the suite.

**Contract**: Add `vitest` `^5.0.0` (Astro 6 floor is ≥3.2 or 4.1-beta.5; 5.x is already resolved as a Stryker peer). Scripts: `"test": "vitest run"`, `"test:watch": "vitest"`. Do not add Playwright or `@cloudflare/vitest-plugin`.

#### 2. Astro-aware Vitest config

**File**: `vitest.config.ts` (new)

**Intent**: Use the official Astro helper so tests share path aliases and `astro.config.mjs`, defaulting to the Node environment Astro 6 requires.

**Contract**: `getViteConfig({ test: { environment: "node", … } })` from `astro/config`. Include the `vitest/config` reference. Do not render `.astro` in this phase. If `vitest run` crashes on the Cloudflare adapter or `astro:server`, apply the research fallback and keep production `adapter: cloudflare()` unchanged.

#### 3. Smoke test

**File**: `src/test/vitest-smoke.test.ts` (new)

**Intent**: Prove the runner executes a file without touching the network or the database.

**Contract**: One assertion that does not import `astro:env/server`, OpenRouter, or Supabase.

### Success Criteria:

#### Automated Verification:

- `vitest` is declared in `package.json` and `npm test` / `npm run test:watch` exist
- `vitest.config.ts` uses `getViteConfig()` with default `environment: "node"`
- `npm test` exits 0
- `npm run lint` passes on the new files

#### Manual Verification:

- Record whether a #15847 / #15878 fallback was required (needed in Phase 6)
- Confirm the run did not start Playwright, a live model, or a Workers pool

**Implementation Note**: After this phase and automated verification pass, pause for manual confirmation before Phase 2.

---

## Phase 2: Progress visibility units (Risk #2)

### Overview

Cheapest Risk #2 signal: while generate is in flight the island shows status + elapsed; HTTP errors do not prepend cards. No data store.

|                             |                                                                                                                                                                                                                                                                                                                  |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Behavior asserted**       | `useElapsedSeconds(null)` is 0; with a `startedAt`, elapsed ticks in whole seconds. `PasteGenerate` shows `role="status"` “Generating typical-use cloze cards…” and “Elapsed {n}s” while `fetch` is pending; on 5xx / timeout-shaped failure it shows `role="alert"` and does **not** call `setCards` / prepend. |
| **Regression caught**       | Progress hidden until 2s; silent success (cards appear) after a failed generate; elapsed stuck at 0.                                                                                                                                                                                                             |
| **Research source**         | `research.md` Risk #2; `PasteGenerate.tsx:88-125`, `188-200`; `useElapsedSeconds.ts:1-25`. No 2s gate in code.                                                                                                                                                                                                   |
| **Edge / error / boundary** | `startedAt === null` → 0 and no interval. Pending `fetch` (never resolve during the assert). `!response.ok` with `{ error, code }` and with an unparseable body (generic alert, no prepend). Existing `initialCards` stay on screen.                                                                             |
| **Anti-pattern avoided**    | Live model; Playwright happy path; asserting a `ms > 2000` branch that does not exist; Workers harness.                                                                                                                                                                                                          |

### Changes Required:

#### 1. RTL + jsdom (units only)

**File**: `package.json`

**Intent**: Render the island and the hook’s `window.setInterval` without changing the default Node env.

**Contract**: Add `@testing-library/react`, `@testing-library/user-event`, and `jsdom`. Do not set the whole suite to jsdom.

#### 2. Elapsed hook

**File**: `src/components/hooks/useElapsedSeconds.test.ts` (new)

**Intent**: Prove elapsed seconds come from `startedAt` + a 1s interval, not from a delay gate.

**Contract**: File-level `// @vitest-environment jsdom` (or the equivalent docblock). Fake timers. `startedAt: null` → `0`. After `startedAt = Date.now()` and `advanceTimersByTime(1000)`, elapsed is `1`. Clearing `startedAt` stops ticks.

#### 3. In-flight panel and no-prepend

**File**: `src/components/cards/PasteGenerate.test.tsx` (new)

**Intent**: Prove the user-visible progress region and that a failed generate cannot look like a save in the island.

**Contract**: jsdom env. Mock `fetch` to `/api/cards/generate` only (this is the **browser** `fetch`, not OpenRouter). Hold the promise pending and assert `role="status"` plus elapsed text; submit via the accessible Generate control. Then reject/resolve `!ok` (503 + `generation_timeout` or `generation_unavailable`) and assert `role="alert"` and that `initialCards` are unchanged (same ids / count). Do not mock `useElapsedSeconds` as the panel oracle — the panel text is the oracle.

### Success Criteria:

#### Automated Verification:

- Hook tests pass under jsdom + fake timers
- PasteGenerate in-flight + no-prepend tests pass
- `npm test` and `npm run lint` pass

#### Manual Verification:

- Tests describe “visible while generating,” not “after two seconds”

**Implementation Note**: Pause for manual confirmation before Phase 3 (first DB-backed phase).

---

## Phase 3: Account isolation vs real RLS (Risk #1)

### Overview

Highest-priority integration: two authenticated users against local Postgres RLS. Fail the suite if Supabase is down. Prove A cannot see B’s cards on inbox, browse, or review, and cannot persist another owner.

|                             |                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Behavior asserted**       | As A, `listFlashcards` / `listBrowseFlashcards` contain none of B’s card **ids** (and none of B-only fixture phrases). As A, `getReviewSession` does not surface B’s kept+due card. `generateCards` as A with a mocked model inserts `user_id = A` only; B’s subsequent list does not contain those rows. Generate with A’s client and `userId: B` does not create B-owned rows. Listed objects and `flashcards` columns have no `paste`. |
| **Regression caught**       | Service-role / RLS-off inbox leak; “logged in” treated as ownership; paste treated as a stored row; filter-copy tests that green-light `listFlashcards` without hitting Postgres.                                                                                                                                                                                                                                                         |
| **Research source**         | `research.md` Risk #1 + follow-up; migrations RLS `auth.uid() = user_id`; `list-flashcards.ts:38-57`; `review-session.ts:77-88`, `120-126`; `generate.ts:15-52`; `dashboard.astro:9-18`.                                                                                                                                                                                                                                                  |
| **Edge / error / boundary** | A and B may share a `word_phrase` (legal) — do not fail on a shared string, only on B’s **id**. B seed: at least one `generated` card (inbox/browse) **and** one `kept` with `due` null or `<= now` (review). Probe A’s JWT + `userId: B` on browse and review (must be empty). `locals.user` unused by `listFlashcards`.                                                                                                                 |
| **Anti-pattern avoided**    | Mocking the store; asserting `.eq("user_id")` exists in `listFlashcards`; Playwright; looking for “B’s paste” in A’s deck; in-memory RLS simulator.                                                                                                                                                                                                                                                                                       |

### Changes Required:

#### 1. Two-user harness

**File**: `src/test/two-user-harness.ts` (new)

**Intent**: Create two real Auth users and isolated anon clients, or fail closed with a message to run `npx supabase start`.

**Contract**: Read `SUPABASE_URL` and `SUPABASE_KEY` from the environment (same names as the app; anon/publishable, not service role). `beforeAll` (or an exported `ensureTwoUsers`) `signUp`s A and B with unique emails; local `enable_confirmations = false` so sessions exist. `persistSession: false` (or separate storages) so A and B do not clobber each other. If URL/key are missing or Auth/DB is unreachable, **throw** (do not `skip`). No `supabase/seed.sql`. Tear down users/rows when practical so reruns stay unique; unique emails per run are enough if delete is awkward.

#### 2. Isolation suite

**File**: `src/lib/services/account-isolation.integration.test.ts` (new)

**Intent**: Hit the real SELECT/INSERT policies the product uses, not a copy of the app filter.

**Contract**: Seed B via **B’s** client: one generated-shaped row (distinctive phrase + known id after insert) and one kept+due row via `createFlashcard` (or equivalent kept insert; `due` null is due). As A:

- `listFlashcards(A.client)` — no B ids, no B-only phrases; each returned card has `userId === A` and no `paste` key.
- `listBrowseFlashcards({ supabase: A.client, userId: A.id, status: "all", q: "" })` — same.
- `listBrowseFlashcards({ supabase: A.client, userId: B.id, … })` — empty cards (RLS probe).
- `getReviewSession({ supabase: A.client, userId: A.id, now })` — `card?.id` is not B’s kept id; `remaining` does not count B.
- `getReviewSession({ supabase: A.client, userId: B.id, now })` — no B card (RLS probe).

As A, `generateCards({ userId: A.id, supabase: A.client, … })` with a mocked OpenRouter body of two **fixture** cards (phrases like `phase1-iso-alpha`, not lifted from `toFlashcard`). Then `listFlashcards(B.client)` does not contain those new ids. As A, `generateCards({ userId: B.id, supabase: A.client, … })` must not insert rows that `listFlashcards(B.client)` can see.

Assert `flashcards` has no `paste` column (information_schema or an insert that would fail if the column existed is unnecessary if a column list from `select * limit 0` / a documented `FLASHCARD_COLUMNS` check is too close to a mirror — prefer `information_schema.columns` for `public.flashcards`).

OpenRouter mock: URL-prefix only; pass through Supabase. Mock `astro:env/server` (or set `OPENROUTER_API_KEY` in the test env) so generate is configured. Fixture JSON must include all six `flashcardFieldsSchema` strings.

### Success Criteria:

#### Automated Verification:

- Harness throws when Supabase is unreachable (no skip)
- Isolation file passes against local RLS
- `npm test` and `npm run lint` pass

#### Manual Verification:

- Tests talked to local Postgres (Studio or harness logs), not a mocked `from().select()`
- With Supabase stopped, `npm test` **fails** on the isolation file

**Implementation Note**: Pause for manual confirmation before Phase 4.

---

## Phase 4: Generate failure does not persist (Risk #2) + 401 fence

### Overview

Failed model/HTTP generate must not write cards or look like a save. Unauthenticated generate is 401. Reuse the two-user DB; oracle is a **new** list, not a write-spy.

|                             |                                                                                                                                                                                                                                                                                                                                                                                           |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Behavior asserted**       | OpenRouter timeout → `GenerateCardsError` `generation_timeout` (or route 503 + that code). Model HTTP 500 / invalid JSON / schema miss → `generation_unavailable` (503). After each, a new `listFlashcards(A)` has the same count and none of the would-be fixture ids. `POST` generate with no user → 401 `{ error: "Authentication required" }` (no `code`), and no OpenRouter `fetch`. |
| **Regression caught**       | Timeout/5xx still inserts; handler returns 200 after a model failure; guest generate reaches persist.                                                                                                                                                                                                                                                                                     |
| **Research source**         | `research.md` Risk #2; `generate-cards.ts:169-202`; `generate.ts:15-61`; `auth.ts:121-129`. Persist is after model success only.                                                                                                                                                                                                                                                          |
| **Edge / error / boundary** | `TimeoutError` vs other fetch throws (`AbortError` → unavailable, still no persist). Invalid JSON body vs non-OK HTTP. A may already have cards — assert **unchanged** identities, not “empty deck.” Empty paste / 400 is out of scope (client-validated).                                                                                                                                |
| **Anti-pattern avoided**    | Live model; Playwright happy path; write-spy as the only “no insert” oracle; Workers harness; waiting 55s.                                                                                                                                                                                                                                                                                |

### Changes Required:

#### 1. Failure × list unchanged

**File**: `src/lib/services/generate-failure.integration.test.ts` (new)

**Intent**: Prove a clean failure at the service (and that the deck did not grow), using the same RLS-backed list as isolation.

**Contract**: Snapshot `listFlashcards(A)` (ids + count) before each case. Mock OpenRouter only: (1) reject with `name: "TimeoutError"`; (2) resolve `{ ok: false, status: 500 }`; (3) resolve ok + body that is not the OpenRouter envelope / not JSON. Expect the matching `GenerateCardsError` code. Re-list as A: same count, same ids. Do not advance real time 55s. Do not call `toFlashcard` as the expected value.

#### 2. Unauthenticated generate 401

**File**: `src/pages/api/cards/generate.auth.test.ts` (new)

**Intent**: Cheap Phase 1 fence for “no session → no generate.” Not the Phase 2 bind-after-signup story.

**Contract**: Invoke `POST` with `locals.user` null/absent and a JSON `{ paste: "x" }`. Expect HTTP 401 and `{ error: "Authentication required" }` without `code`. OpenRouter `fetch` must not run. Do not start a signup flow. Node env; no Container required if a minimal `APIRoute` context stub is enough.

### Success Criteria:

#### Automated Verification:

- Timeout / 5xx / invalid-JSON cases pass and leave A’s list unchanged
- Unauthenticated generate returns 401 and does not call OpenRouter
- `npm test` and `npm run lint` pass

#### Manual Verification:

- Network logs / mock show no live `openrouter.ai` call

**Implementation Note**: Pause for manual confirmation before Phase 5.

---

## Phase 5: Persist-then-list and lock empty-200 (Risk #3)

### Overview

A successful generate is visible on a **new** list/browse for that user. Empty-200 stays a locked current contract (no product change). Review stays out of the persist oracle.

|                             |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Behavior asserted**       | Mocked model returns two valid fixtures → `generateCards` as A returns those phrases (from DB-selected rows) **and** a subsequent `listFlashcards(A)` / `listBrowseFlashcards(A)` contains them; `listFlashcards(B)` does not. Model `{ cards: [] }` → 200-shaped result, `failedCount === 0`, no insert, A’s list count unchanged. All-invalid candidates → `cards: []`, `failedCount === N`, no insert, count unchanged. `getReviewSession(A)` after generate-only fixtures is **not** used to decide persist success (A’s generated cards stay out of the kept+due queue). |
| **Regression caught**       | HTTP 200 treated as “deck populated”; island prepend trusted as refresh; persist skipped after a valid model; empty-200 silently inserting; review-empty treated as data loss.                                                                                                                                                                                                                                                                                                                                                                                                |
| **Research source**         | `research.md` Risk #3 + follow-up; `generate.ts:46-53` (200, not 201); `generate-cards.ts:211-213`; `PasteGenerate.tsx:114` (no refetch); `review-session.ts` kept-only.                                                                                                                                                                                                                                                                                                                                                                                                      |
| **Edge / error / boundary** | Two legal empty-200 shapes (empty envelope vs all-invalid). Cap/truncate is out of scope unless a fixture accidentally sends >15. Empty RETURNING-after-insert is **not** the happy-path oracle (opposite symptom; document only).                                                                                                                                                                                                                                                                                                                                            |
| **Anti-pattern avoided**    | Happy-path insert only; `expect(list).toEqual(inserted.map(toFlashcard))`; review or `/cards?status=kept` as persist success; product change to 503 on empty cards.                                                                                                                                                                                                                                                                                                                                                                                                           |

### Changes Required:

#### 1. Persist-then-independent-list

**File**: `src/lib/services/generate-persist.integration.test.ts` (new)

**Intent**: Use a second read path as the oracle so mapping drift and “200 + empty deck” can fail.

**Contract**: Independent fixture phrases (e.g. `phase1-persist-oak`, `phase1-persist-elm`) defined in the test file, not imported from `flashcard-row.ts`. After `generateCards` as A: new `listFlashcards(A)` and `listBrowseFlashcards({ userId: A.id, status: "generated" | "all" })` contain both phrases and the new ids; each row `userId === A`, `status === "generated"`. New `listFlashcards(B)` does not contain those ids/phrases. Do not assert list deep-equals the generate return mapped through `toFlashcard`.

#### 2. Lock empty-200 (no write)

**File**: same as above (additional cases)

**Intent**: Lock today’s empty-success contract without changing `generateCards`.

**Contract**: (1) Model content `{ cards: [] }` → result `cards.length === 0`, `failedCount === 0`, A’s list count/ids unchanged. (2) Model cards missing required fields → `cards.length === 0`, `failedCount` matches the invalid count, list unchanged. Do not add a mocked-empty-RETURNING case as persist success.

### Success Criteria:

#### Automated Verification:

- New list/browse for A contain the fixture cards; B’s list does not
- Both empty-200 shapes leave A’s list unchanged
- `npm test` and `npm run lint` pass

#### Manual Verification:

- Persist success is judged from a new list call, not generate JSON, `toFlashcard`, or review

**Implementation Note**: Pause for manual confirmation before Phase 6.

---

## Phase 6: Cookbook §6

### Overview

Write down how to add the next test so Phase 2 of the rollout (and everyday `/10x-tdd`) copies these patterns instead of inventing mocks.

### Changes Required:

#### 1. Fill test-plan cookbook

**File**: `context/foundation/test-plan.md`

**Intent**: Replace Phase 1 TBD stubs with the patterns this change shipped. Do not rewrite §1–§5 strategy (except §3 Status → `planned`/`implementing`/`complete` is orchestrator-owned; this phase may set Phase 1 Status to `complete` only when Progress is done — leave that flip to `/10x-implement` or `/10x-test-plan`).

**Contract**: Rewrite:

- **§6.1** — colocate `*.test.ts(x)` next to source; default env `node`; jsdom **file** env for hooks/islands; progress = in-flight `role="status"` + elapsed, not a 2s gate; fake timers; no live model.
- **§6.2** — local Supabase required (fail closed); two-user harness; mock OpenRouter URL only and pass through `fetch`; isolation asserts **ids** + RLS probes (`userId: B` on A’s client); no store mocks; no `listFlashcards` filter copy.
- **§6.4** — request → response **and** side-effects (list); mock model/HTTP edge only; unauthenticated write → 401; other-user **resource id** mutate remains Phase 2.
- **§6.5** — generate: timeout/5xx ⇒ no persist; persist-then-**new** list; lock empty-200; never review as generate persist oracle; never live model or re-implemented FSRS (FSRS is Phase 2).
- **§6.6** — 2–3 lines: Phase 1 shipped Vitest 5 + `getViteConfig()` + isolation/generate contracts; note any adapter fallback; CI test job still Phase 3.

Keep AI-native lines dated (cursor-ide-browser checked 2026-09-13). Do not add file:line anchors to §2.

#### 2. Point agent rules at the suite

**File**: `AGENTS.md`

**Intent**: Stop telling agents there is no runner.

**Contract**: Replace the “No test runner or `*.test.*` files exist” sentence with `npm test` (Vitest) and a pointer to `context/foundation/test-plan.md` §6. Do not add CI-test claims.

### Success Criteria:

#### Automated Verification:

- §6.1, §6.2, §6.4, and §6.5 are no longer TBD stubs
- §6.6 contains a Phase 1 shipped note

#### Manual Verification:

- A reader who was not in this planning chat can add an isolation or generate test from §6 alone (surfaces, oracle, anti-patterns)

**Implementation Note**: This is the last phase. After automated verification, confirm the cookbook read-through before calling the change implemented.

---

## Testing Strategy

### Unit Tests:

- `useElapsedSeconds` — null clock, tick, stop
- `PasteGenerate` — in-flight status + elapsed; 5xx/timeout do not prepend; `initialCards` preserved
- `POST /api/cards/generate` — no user ⇒ 401, no OpenRouter `fetch`
- Vitest smoke — runner only

### Integration Tests:

- Two-user RLS: inbox, browse, review (including A’s JWT + `userId: B` probes)
- Generate as A persists A only; generate as A with `userId: B` writes nothing B can list
- No paste column / no paste on list DTOs
- Timeout / 5xx / invalid JSON ⇒ list unchanged
- Persist-then-new-list fixtures; two empty-200 shapes ⇒ count unchanged

### Manual Testing Steps:

1. `npx supabase start` (Docker). Export `SUPABASE_URL` + anon `SUPABASE_KEY` the same way as `.dev.vars`.
2. `npm test` — all phases green.
3. Stop Supabase; `npm test` — isolation/persist/failure files fail closed (not skip).
4. Confirm no live OpenRouter traffic and no Playwright.
5. Read §6 and check it names oracles and anti-patterns, not “cover the module.”

## Performance Considerations

Isolation/persist tests are I/O-bound on local Postgres and Auth. Unique emails per run avoid collisions. Do not `AbortSignal.timeout(55_000)` in real time. Do not add a Workers pool (heavier and not the first signal).

## Migration Notes

No schema migration. No product behavior change. Existing local DBs already have RLS from `20260913152707_create_flashcards.sql`. Tests create Auth users; leftover users from failed teardowns are harmless if emails are unique. CI remains lint+build until test-plan Phase 3 — **do not claim isolation is proven in GitHub Actions**.

## References

- Test plan: `context/foundation/test-plan.md` (§1–§5 frozen; §6 filled in Phase 6)
- Research: `context/changes/testing-critical-path-coverage/research.md`
- Change identity: `context/changes/testing-critical-path-coverage/change.md`
- Astro testing (`getViteConfig`, Node env): Context7 `/withastro/docs`, checked 2026-09-13
- Vitest env + fake timers: Context7 `/vitest-dev/vitest`, checked 2026-09-13
- RTL render / roles: Context7 `/testing-library/testing-library-docs`, checked 2026-09-13
- Inbox list: `src/lib/services/list-flashcards.ts:38-50`
- Generate persist + timeout: `src/lib/services/generate-cards.ts:11`, `169-175`, `206-238`
- Progress island: `src/components/cards/PasteGenerate.tsx:88-125`, `188-200`
- RLS: `supabase/migrations/20260913152707_create_flashcards.sql:20-48`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Bootstrap Vitest

#### Automated

- [x] 1.1 `vitest` is declared in `package.json` and `npm test` / `npm run test:watch` exist — 5884bc4
- [x] 1.2 `vitest.config.ts` uses `getViteConfig()` with default `environment: "node"` — 5884bc4
- [x] 1.3 `npm test` exits 0 — 5884bc4
- [x] 1.4 `npm run lint` passes on the new files — 5884bc4

#### Manual

- [ ] 1.5 Record whether a #15847 / #15878 fallback was required (needed in Phase 6)
- [ ] 1.6 Confirm the run did not start Playwright, a live model, or a Workers pool

### Phase 2: Progress visibility units (Risk #2)

#### Automated

- [x] 2.1 Hook tests pass under jsdom + fake timers — 90d79a6
- [x] 2.2 PasteGenerate in-flight + no-prepend tests pass — 90d79a6
- [x] 2.3 `npm test` and `npm run lint` pass — 90d79a6

#### Manual

- [ ] 2.4 Tests describe “visible while generating,” not “after two seconds”

### Phase 3: Account isolation vs real RLS (Risk #1)

#### Automated

- [ ] 3.1 Harness throws when Supabase is unreachable (no skip)
- [ ] 3.2 Isolation file passes against local RLS
- [ ] 3.3 `npm test` and `npm run lint` pass

#### Manual

- [ ] 3.4 Tests talked to local Postgres (Studio or harness logs), not a mocked `from().select()`
- [ ] 3.5 With Supabase stopped, `npm test` fails on the isolation file

### Phase 4: Generate failure does not persist (Risk #2) + 401 fence

#### Automated

- [ ] 4.1 Timeout / 5xx / invalid-JSON cases pass and leave A’s list unchanged
- [ ] 4.2 Unauthenticated generate returns 401 and does not call OpenRouter
- [ ] 4.3 `npm test` and `npm run lint` pass

#### Manual

- [ ] 4.4 Network logs / mock show no live `openrouter.ai` call

### Phase 5: Persist-then-list and lock empty-200 (Risk #3)

#### Automated

- [ ] 5.1 New list/browse for A contain the fixture cards; B’s list does not
- [ ] 5.2 Both empty-200 shapes leave A’s list unchanged
- [ ] 5.3 `npm test` and `npm run lint` pass

#### Manual

- [ ] 5.4 Persist success is judged from a new list call, not generate JSON, `toFlashcard`, or review

### Phase 6: Cookbook §6

#### Automated

- [ ] 6.1 §6.1, §6.2, §6.4, and §6.5 are no longer TBD stubs
- [ ] 6.2 §6.6 contains a Phase 1 shipped note

#### Manual

- [ ] 6.3 A reader who was not in this planning chat can add an isolation or generate test from §6 alone (surfaces, oracle, anti-patterns)
