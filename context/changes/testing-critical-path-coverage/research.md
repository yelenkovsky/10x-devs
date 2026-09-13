---
date: 2026-09-13T21:24:00+00:00
researcher: agent
git_commit: bafa12bcc77411d7e48490cbe8c45e31ff74c9fc
branch: main
repository: 10x-devs
topic: "Ground rollout Phase 1 of context/foundation/test-plan.md (Risks #1, #2, #3)"
tags: [research, codebase, isolation, generate, persist, vitest, test-plan]
status: complete
last_updated: 2026-09-13
last_updated_by: agent
last_updated_note: "Added follow-up research for parallel-agent deltas (installed versions, client hang, 1102, empty-RETURNING opposite symptom)"
---

# Research: Ground rollout Phase 1 of `context/foundation/test-plan.md`

**Date**: 2026-09-13T21:24:00+00:00
**Researcher**: agent
**Git Commit**: `bafa12bcc77411d7e48490cbe8c45e31ff74c9fc`
**Branch**: main
**Repository**: 10x-devs

## Research Question

Ground rollout Phase 1 of `context/foundation/test-plan.md`.

Risks to verify: Risk #1, #2, #3 from §2.

Risk response guidance to verify, not blindly accept:

- Risk #1: prove User A’s list/review/generate never includes User B’s cards or paste; challenge “logged in” equals “owns the row.”; avoid mocking away the data store or asserting an internal filter copy.
- Risk #2: prove Slow or failed generate shows progress and a clean failure; does not freeze or claim cards were saved; challenge local Node success means Worker success; avoid calling the live model or e2e-ing the whole generate happy path.
- Risk #3: prove After a successful generate, a new fetch for that user returns the cards; challenge HTTP 201 means the deck is populated; avoid happy-path insert only and an oracle copied from the insert mapper.

Hot-spot directories that raised these risks (likelihood evidence — NOT anchors): `src/lib/services`, `src/pages/api`, `src/components/cards`, `src/lib`.

Stack: Vitest via Astro `getViteConfig()` (none yet; bootstrap in this phase); `node` env for Container tests; mock the model/HTTP edge only; do not call a live model in CI; do not lead with Playwright; Workers harness is not the first layer.

## Summary

Phase 1 is still the right first suite. There are **zero** test files, no Vitest dependency, and no CI test step. Isolation, generate failure, and persist-after-refresh are real contracts in live code — not speculative safeguards waiting to be invented.

**Risk #1 is grounded and the response guidance holds**, with two corrections. Isolation is **RLS on `flashcards` plus a cookie-scoped anon SSR client**, not “session exists.” Dashboard inbox `listFlashcards` has **no** `.eq("user_id")`; browse and review add an app-level owner predicate on top of RLS. Paste is **not stored** — it lives in the generate POST body and React state only — so “User B’s paste appears in User A’s list” is the wrong oracle. The cheap test is a two-user integration against real Postgres/RLS, not a mocked filter copy.

**Risk #2 is grounded for progress + clean model/HTTP failure, and partly overstated for Worker hang.** Progress is a client panel shown for the whole in-flight `fetch`, not a >2s gate. Failed OpenRouter calls throw before persist and become 4xx/5xx; the island does not prepend cards. Generate success is **HTTP 200**, and **200 + `cards: []` is a current empty-success path**. Cloudflare HTTP Workers have **no wall-clock duration limit** while the client stays connected; a 55s I/O wait is legal. The honest “Node ≠ Worker” challenge is **Vitest `node` env ≠ workerd**, not “local Node app vs production Worker” — `npm run dev` is already workerd. Do not add `@cloudflare/vitest-plugin` first. Do not call a live model.

**Risk #3 is grounded; correct “HTTP 201” to HTTP 200.** Persist happens before the JSON body is returned. The dashboard does **not** refetch after generate — it prepends the generate payload — so a refresh oracle must be a **new** `listFlashcards` / `listBrowseFlashcards` for that user. `persistValidCards` treats empty insert `data` as success (`[]`); `createFlashcard` does not. Review is the wrong persist oracle: generate writes `status: "generated"`, and the due queue is `kept` only.

**Stack:** add Vitest **≥ 4.1.0** (Astro 6 `getViteConfig()` needs ≥ 3.2 or 4.1-beta.5; the Astro 6 `exports is not defined` crash is fixed in Vitest 4.1.0-beta.6+). Use `getViteConfig()` + `environment: "node"`. Keep a documented fallback: filter `astro:server` / override the Cloudflare adapter via `getViteConfig`’s second argument if #15878-class `resolve.external` still fires. Mock `fetch` at `https://openrouter.ai/api/v1/chat/completions` only.

## Detailed Findings

### Identity and session (shared by all three risks)

Every request runs `src/middleware.ts`, which builds the cookie SSR client and sets `locals.user` from `supabase.auth.getUser()` — or `null` if secrets are missing.

```7:17:src/middleware.ts
export const onRequest = defineMiddleware(async (context, next) => {
  const supabase = createClient(context.request.headers, context.cookies);

  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    context.locals.user = user ?? null;
  } else {
    context.locals.user = null;
  }
```

HTML gates (`/dashboard`, `/review`, `/cards`) redirect guests to sign-in. JSON writes must call `requireUser`, which is **session-existence only**:

```121:129:src/lib/auth.ts
export function requireUser(locals: App.Locals): Response | null {
  if (locals.user) {
    return null;
  }

  return new Response(JSON.stringify({ error: "Authentication required" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}
```

The data client is `@supabase/ssr` with `SUPABASE_KEY`. README / deploy docs specify the **anon / publishable** key, not the service role. RLS is therefore in force for app traffic. A service-role key in `.dev.vars` would silently disable Risk #1’s mechanism of record — that is an env contract, not a product test.

There is **no** `GET /api/cards` list route. Post-refresh fetch is SSR: `/dashboard` → `listFlashcards`; `/cards` → `listBrowseFlashcards`; `/review` → `getReviewSession`.

### Risk #1 — Account isolation (cards; paste is request-scoped)

**Failure path.** User A signed in, User B has rows (or a paste). A’s dashboard, browse, review, or generate response includes B’s cards or B’s paste.

**Where it actually lives.**

1. **RLS is the inbox isolation mechanism.** Policies wrap `auth.uid()` and bind every operation to `user_id`:

```20:32:supabase/migrations/20260913152707_create_flashcards.sql
alter table public.flashcards enable row level security;

create policy flashcards_select_own
  on public.flashcards
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy flashcards_insert_own
  on public.flashcards
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);
```

`anon`/`public` are revoked; `authenticated` gets DML. Confirmed in [the create-flashcards migration](https://github.com/yelenkovsky/10x-devs/blob/bafa12bcc77411d7e48490cbe8c45e31ff74c9fc/supabase/migrations/20260913152707_create_flashcards.sql#L20-L48).

2. **Dashboard list does not add an owner predicate.** Isolation is 100% JWT + RLS:

```38:43:src/lib/services/list-flashcards.ts
export async function listFlashcards(supabase: SupabaseClient): Promise<Flashcard[]> {
  const { data, error } = await supabase
    .from("flashcards")
    .select(FLASHCARD_COLUMNS)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });
```

Called from [`src/pages/dashboard.astro`](https://github.com/yelenkovsky/10x-devs/blob/bafa12bcc77411d7e48490cbe8c45e31ff74c9fc/src/pages/dashboard.astro#L9-L14) with the request cookie client. This is the load-bearing “logged in ≠ owns the row” surface: `requireUser` / middleware only prove a session; the SELECT has no `user_id` in application SQL.

3. **Browse and review do add `.eq("user_id", input.userId)`**, with `userId` from `locals.user.id` (never from the query string or body). See [`listBrowseFlashcards`](https://github.com/yelenkovsky/10x-devs/blob/bafa12bcc77411d7e48490cbe8c45e31ff74c9fc/src/lib/services/list-flashcards.ts#L52-L57) and [`getReviewSession` / `countDueQueue`](https://github.com/yelenkovsky/10x-devs/blob/bafa12bcc77411d7e48490cbe8c45e31ff74c9fc/src/lib/services/review-session.ts#L120-L126). Mutate/grade also `.eq("user_id", …)` — that is Risk #4 (Phase 2), not Phase 1.

4. **Generate writes the session user, not a client-supplied owner.** [`POST /api/cards/generate`](https://github.com/yelenkovsky/10x-devs/blob/bafa12bcc77411d7e48490cbe8c45e31ff74c9fc/src/pages/api/cards/generate.ts#L15-L52) checks `requireUser`, then passes `userId: context.locals.user.id`. Insert rows set `user_id: userId`. The body schema is `{ paste: string }` only.

5. **Paste is not a stored resource.** `flashcards` has no paste column. Generate sends paste to OpenRouter as the user message and persists only card fields + `generation_id`. The island keeps paste in `useState`. PRD guardrail “Pasted word lists/texts are not shown to other users” is satisfied by **not persisting paste**, not by a list filter. A test that looks for “User B’s paste in User A’s deck” will invent a column.

**Challenge verdict.** Confirmed. “Logged in” is `locals.user` truthy. Ownership is `auth.uid() = user_id` (RLS) and, on some paths, a second `.eq("user_id", locals.user.id)`. Asserting that `listFlashcards` contains `.eq("user_id")` is a **false filter copy** — that function does not have it. Mocking `supabase.from().select()` to return A-only rows tests the mock.

**Guidance verdict.** Keep the prove-protection sentence for **cards**. Reframe paste: prove generate cannot persist another user’s `user_id`, and that no paste column exists / list payloads have no paste field. Keep the anti-patterns.

**Cheapest useful layer.** Integration against **local Supabase (real RLS)** with two authenticated clients:

- Seed or generate (mocked model) cards for A and B.
- As A, `listFlashcards` / `listBrowseFlashcards` / `getReviewSession` must not contain B’s `id` or distinctive `word_phrase`.
- As A, `generateCards` must insert `user_id = A`; B’s subsequent list must not contain those rows.

Do not use Playwright. Do not use an in-memory “RLS simulator” as the oracle. Docker/local Supabase is the cost of an honest isolation test; Phase 3 CI wiring can fail closed if the DB is absent.

**Hot-spot check.** `src/lib/services` and `src/pages/api` are fair **likelihood** evidence (list/generate/review live there). They are incomplete as failure location: the inbox leak path is **RLS + `listFlashcards` + dashboard SSR**. `supabase/migrations` and `src/pages/dashboard.astro` were not cited in §2 Source.

**Not Phase 1.** Mutate/review of B’s id (Risk #4). Guest persist / bind-after-signup (Risk #5). Both already have `requireUser` + owner predicates; keep them for Phase 2.

### Risk #2 — Generate progress, timeout, empty success (Worker vs Node)

**Failure path.** Generate is slow or fails. The UI freezes, never shows progress, or looks successful with no cards saved. Works in a Node test / mental model of local Node, fails on workerd.

**Where it actually lives.**

1. **Request path.** `PasteGenerate` `fetch`es `POST /api/cards/generate` → `requireUser` + zod paste → `generateCards` → `fetch(OPENROUTER_URL)` with `AbortSignal.timeout(55_000)` → parse/validate ≤15 cards → `persistValidCards` → JSON **200**.

```142:175:src/lib/services/generate-cards.ts
    response = await fetch(OPENROUTER_URL, {
      method: "POST",
      // ...
      signal: AbortSignal.timeout(GENERATE_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new GenerateCardsError("generation_timeout", "Generation timed out. Try again.");
    }
    throw unavailable();
  }
```

`GENERATE_TIMEOUT_MS` is `55_000` ([line 11](https://github.com/yelenkovsky/10x-devs/blob/bafa12bcc77411d7e48490cbe8c45e31ff74c9fc/src/lib/services/generate-cards.ts#L11)). Non-OK model HTTP, bad JSON, and schema miss all throw `generation_unavailable` (503) **before** persist. Route maps `GenerateCardsError` to `{ error, code }` + `error.status`; unknown throws become 503 `generation_unavailable`.

2. **Progress contract.** There is **no 2s delay in code**. The PRD NFR asks for visible progress on operations longer than two seconds. S-01 implemented a panel for the **entire** in-flight request: `isGenerating` + `useElapsedSeconds(startedAt)` (1s interval). See [`PasteGenerate.tsx` 85–125 and 188–200](https://github.com/yelenkovsky/10x-devs/blob/bafa12bcc77411d7e48490cbe8c45e31ff74c9fc/src/components/cards/PasteGenerate.tsx#L85-L200) and [`useElapsedSeconds.ts`](https://github.com/yelenkovsky/10x-devs/blob/bafa12bcc77411d7e48490cbe8c45e31ff74c9fc/src/components/hooks/useElapsedSeconds.ts#L1-L25). S-01 plan: “The progress panel is entirely client-side for the in-flight `fetch`. The server returns one JSON body.”

3. **Failure does not claim save.** On `!response.ok` or parse failure the island `setError(...)` and **returns without** `setCards`. `finally` clears `isGenerating`. That matches “clean failure; does not claim cards were saved” for HTTP errors.

4. **Empty success is real.** `generateCards` can return `{ cards: [], failedCount, truncated, cap }` after all candidates fail zod, because `persistValidCards` returns `[]` when `validCards.length === 0`. The route still returns **200**. The island prepends `[]` and shows no generate error. That is “looks like an empty success,” overlapping Risk #3.

5. **Node vs Worker — what is real.**

   - Local `npm run dev` uses `@astrojs/cloudflare` / workerd (`CLAUDE.md`, `astro.config.mjs` `adapter: cloudflare()`). “Works on Node locally” is a **stale mental model** for this repo’s app runtime.
   - Vitest Phase 1 will use **`environment: "node"`**. Passing those tests does **not** prove workerd `AbortSignal.timeout`, `astro:env/server`, or CPU accounting.
   - Cloudflare docs (2026): HTTP Workers have **no duration limit** while the client stays connected; I/O wait does not count as CPU. Default paid CPU is 30s (Free 10ms). A 55s OpenRouter wait is I/O. `wrangler.jsonc` does not set `limits.cpu_ms`. Limits are **not enforced in local Wrangler**.
   - Residual (do not promote to e2e/Workers harness in Phase 1): client disconnect cancels the invocation; runtime-update 30s grace; Free-plan 10ms CPU on heavier SSR; `AbortSignal.timeout` quirks if `nodejs_compat` were off (it is on).

**Challenge verdict.** Keep the challenge, but rename it: **Vitest `node` success ≠ workerd/production success.** Do not spend Phase 1 budget proving a 30s HTTP wall-clock that official Workers limits no longer have.

**Guidance verdict.**

| Cell | Verdict |
|------|---------|
| Prove progress + clean failure + no false save | Confirm for model/HTTP errors and timeouts |
| Prove no empty success | **Correct** — 200 + `cards: []` exists |
| Challenge local Node = Worker | **Correct the wording** (see above) |
| Layer: integration + unit on >2s rule | **Correct the unit** — test “progress visible while `isGenerating`” and elapsed ticks; there is no `if (ms > 2000)` branch |
| Anti-pattern: live model / full e2e happy path | Confirm |

**Cheapest useful layer.**

- **Unit (jsdom or node + React test renderer):** `useElapsedSeconds` with fake timers; `PasteGenerate` shows the `role="status"` progress region while generate is in flight (mock `fetch` pending).
- **Integration (`node`, mock `fetch` to OpenRouter only):** timeout → `generation_timeout`, insert not called; HTTP 500 / invalid JSON → 503, insert not called. Use a write-spy Supabase or real DB. Do not e2e the happy path. Do not `@cloudflare/vitest-plugin` first.

**Hot-spot check.** `src/components/cards` is fair for progress UI. Timeout/error translation lives in `src/lib/services/generate-cards.ts`, not the island. Worker hang as a *likely* production defect from a 30s wall clock is **misleading**.

### Risk #3 — Success response vs populated deck on refresh

**Failure path.** Generate reports success. Refresh (or a later list) shows an empty deck for that user.

**Where it actually lives.**

1. **Write-then-respond.** `generateCards` awaits `persistValidCards` then returns the **DB-selected** mapped rows. The route returns that object as **200**, not 201:

```46:53:src/pages/api/cards/generate.ts
  try {
    const result = await generateCards({
      userId: context.locals.user.id,
      paste,
      origin: context.url.origin,
      supabase,
    });
    return jsonResponse(result, 200);
```

Insert errors throw 503. A 200 means “handler finished after persist,” **not** “`cards.length > 0`.”

2. **Empty persist is success.**

```211:213:src/lib/services/generate-cards.ts
  if (validCards.length === 0) {
    return [];
  }
```

If `validCards.length > 0` but `insert().select()` returns `data: []` and `error: null` (RLS `WITH CHECK` miss is the usual suspect), `z.array(flashcardRowSchema).safeParse([])` succeeds and the handler still returns 200 `{ cards: [] }`. [`createFlashcard`](https://github.com/yelenkovsky/10x-devs/blob/bafa12bcc77411d7e48490cbe8c45e31ff74c9fc/src/lib/services/create-flashcard.ts#L53-L55) treats empty insert data as 503. Generate does not. That is the precise “HTTP success ≠ deck populated” bug-shaped contract.

3. **The island trusts the generate body.** After 200 it does `setCards((current) => [...parsed.data.cards, ...current])` — **no second fetch**. Refresh reloads `/dashboard` via `listFlashcards`. The useful oracle is that **new list**, not the generate JSON and not `toFlashcard` of the insert result.

4. **Silent empty list was already fixed.** S-01 impl-review F1: `listFlashcards` used to return `[]` on select error (refresh looked like data loss). Current code **throws**; `dashboard.astro` sets `loadError`. Do not re-plan that as an open defect. Still assert load-error ≠ empty-deck copy if a list test injects a select failure.

5. **Guest vs signed-in.** Generate/create require `requireUser` (401). Dashboard is a protected HTML route. Guest “success then empty refresh” is Risk #5. Phase 1 should not swallow it as the main persist suite; a single 401 on unauthenticated `POST /api/cards/generate` is a cheap fence, not the Phase 2 bind story.

6. **Review is a false persist oracle.** Generate inserts `status: "generated"`. Review counts `status = "kept"` and due. An empty review after generate is **expected**. Use dashboard/browse list.

**Challenge verdict.** Confirmed, after correcting 201 → **200**.

**Guidance verdict.** Prove-protection sentence is right if “new fetch” means `listFlashcards` / `listBrowseFlashcards` as the same user. Anti-patterns confirmed. Guest-vs-signed-in is Phase 2 except the 401 fence.

**Cheapest useful layer.** Integration, mocked model:

- Model returns two valid fixtures (known `wordPhrase` values, not copied from `toFlashcard`).
- `generateCards` as user A.
- **New** `listFlashcards(A)` / `listBrowseFlashcards(A)` contains those phrases; `listFlashcards(B)` does not.
- Model returns only invalid cards → `cards: []`, list row count unchanged.
- Optional: insert returns `[]` without error → document current 200-empty contract (or treat as the regression to lock if product decides it must be 503).

**Hot-spot check.** `src/lib` (14 commits/30d) is coarse likelihood evidence. The write/read pair is `generate-cards.ts` `persistValidCards` + `list-flashcards.ts` + `dashboard.astro`. Not misleading enough to drop the risk; too broad to treat `src/lib` as the anchor.

### Existing tests

| Artifact | State |
|----------|--------|
| `*.test.*` / `*.spec.*` / `__tests__/` | **0 files** |
| `vitest` in `package.json` | **absent** (Stryker already declares `@stryker-mutator/vitest-runner`) |
| `vitest.config.*` / Playwright config | **absent** |
| `stryker.config.json` | `testRunner: "vitest"` with no suite — mutation testing is premature (§7) |
| CI (`.github/workflows/ci.yml`) | `astro sync`, lint, build — **no test job** (Phase 3 gate) |
| `lessons.md` | **missing** — no prior test/isolation lessons |

### Stack bootstrap (Astro 6 + Vitest)

From local manifests: `astro` `^6.3.1`, `@astrojs/cloudflare` `^13.5.0`, Vite override `^7.3.2`, Node 22 (`.nvmrc` 22.14.0). No Vitest.

Official docs (`/withastro/docs`, checked 2026-09-13):

- Documented path is `getViteConfig()` from `astro/config` in `vitest.config.ts`.
- Astro 6 Container tests that render `.astro` files must use `environment: "node"` (client `jsdom`/`happy-dom` no longer allowed).
- `getViteConfig()` requires **Vitest ≥ 3.2 or 4.1-beta.5**.

Open crash (research assignment):

- [Astro #15847](https://github.com/withastro/astro/issues/15847) / [#15849](https://github.com/withastro/astro/issues/15849): `vitest run` + `getViteConfig()` → `ReferenceError: exports is not defined` (`cookie` CJS via `astro:server` `configureServer`). Closed as **upstream Vitest**; reporters confirmed **`vitest@4.1.0-beta.6` fixes it**. Manual workaround: wrap `getViteConfig`, filter plugin name `astro:server` (and `astro:server-client`).
- [Astro #15878](https://github.com/withastro/astro/issues/15878): Vitest 4 + `@astrojs/cloudflare` → `@cloudflare/vite-plugin` rejects `resolve.external` on the SSR environment. Closed / fix-verified on the adapter. If 13.5.0 still throws, documented community workaround is a Node adapter when `process.env.VITEST`, or pass a second argument to `getViteConfig()` to override `adapter`.

**Phase 1 recommendation (verify in implement, do not guess green):**

1. Add `vitest` **≥ 4.1.0** (stable 4.1 line, not 4.0.x).
2. `vitest.config.ts` via `getViteConfig({ test: { environment: "node", … } })`.
3. Scripts: `"test": "vitest run"`, `"test:watch": "vitest"`.
4. If startup still crashes: apply the `astro:server` filter; if Cloudflare `resolve.external` throws, override adapter for the test config only.
5. Do not add Playwright. Do not add `@cloudflare/vitest-plugin` / pool-workers as the first layer.
6. Mock global `fetch` for `OPENROUTER_URL` only. Do not mock `listFlashcards` / RLS as the isolation oracle.

Progress-hook unit tests that need `window.setInterval` can use a `jsdom` environment **only** for those files (`// @vitest-environment jsdom`); do not render `.astro` there.

## Code References

- [`src/middleware.ts:7-33`](https://github.com/yelenkovsky/10x-devs/blob/bafa12bcc77411d7e48490cbe8c45e31ff74c9fc/src/middleware.ts#L7-L33) — cookie session → `locals.user`; HTML protect; JSON must `requireUser`
- [`src/lib/auth.ts:3`](https://github.com/yelenkovsky/10x-devs/blob/bafa12bcc77411d7e48490cbe8c45e31ff74c9fc/src/lib/auth.ts#L3) — `PROTECTED_ROUTES` = dashboard, review, cards
- [`src/lib/auth.ts:121-129`](https://github.com/yelenkovsky/10x-devs/blob/bafa12bcc77411d7e48490cbe8c45e31ff74c9fc/src/lib/auth.ts#L121-L129) — `requireUser` is session-existence only
- [`src/lib/supabase.ts:5-23`](https://github.com/yelenkovsky/10x-devs/blob/bafa12bcc77411d7e48490cbe8c45e31ff74c9fc/src/lib/supabase.ts#L5-L23) — SSR client, anon key
- [`supabase/migrations/20260913152707_create_flashcards.sql:20-48`](https://github.com/yelenkovsky/10x-devs/blob/bafa12bcc77411d7e48490cbe8c45e31ff74c9fc/supabase/migrations/20260913152707_create_flashcards.sql#L20-L48) — RLS owner policies
- [`src/lib/services/list-flashcards.ts:38-50`](https://github.com/yelenkovsky/10x-devs/blob/bafa12bcc77411d7e48490cbe8c45e31ff74c9fc/src/lib/services/list-flashcards.ts#L38-L50) — inbox list, no `user_id` filter
- [`src/lib/services/list-flashcards.ts:52-57`](https://github.com/yelenkovsky/10x-devs/blob/bafa12bcc77411d7e48490cbe8c45e31ff74c9fc/src/lib/services/list-flashcards.ts#L52-L57) — browse list, explicit `user_id`
- [`src/pages/dashboard.astro:9-18`](https://github.com/yelenkovsky/10x-devs/blob/bafa12bcc77411d7e48490cbe8c45e31ff74c9fc/src/pages/dashboard.astro#L9-L18) — refresh/list entry; `loadError` on throw
- [`src/pages/cards.astro:19-28`](https://github.com/yelenkovsky/10x-devs/blob/bafa12bcc77411d7e48490cbe8c45e31ff74c9fc/src/pages/cards.astro#L19-L28) — browse SSR with `user.id`
- [`src/pages/api/cards/generate.ts:15-62`](https://github.com/yelenkovsky/10x-devs/blob/bafa12bcc77411d7e48490cbe8c45e31ff74c9fc/src/pages/api/cards/generate.ts#L15-L62) — auth, paste zod, 200 on service result
- [`src/lib/services/generate-cards.ts:11`](https://github.com/yelenkovsky/10x-devs/blob/bafa12bcc77411d7e48490cbe8c45e31ff74c9fc/src/lib/services/generate-cards.ts#L11) — 55s timeout constant
- [`src/lib/services/generate-cards.ts:108-135`](https://github.com/yelenkovsky/10x-devs/blob/bafa12bcc77411d7e48490cbe8c45e31ff74c9fc/src/lib/services/generate-cards.ts#L108-L135) — model → validate → persist → return
- [`src/lib/services/generate-cards.ts:169-175`](https://github.com/yelenkovsky/10x-devs/blob/bafa12bcc77411d7e48490cbe8c45e31ff74c9fc/src/lib/services/generate-cards.ts#L169-L175) — timeout → `generation_timeout`
- [`src/lib/services/generate-cards.ts:206-238`](https://github.com/yelenkovsky/10x-devs/blob/bafa12bcc77411d7e48490cbe8c45e31ff74c9fc/src/lib/services/generate-cards.ts#L206-L238) — persist; empty valid set / empty `data` → `[]`
- [`src/lib/services/create-flashcard.ts:53-55`](https://github.com/yelenkovsky/10x-devs/blob/bafa12bcc77411d7e48490cbe8c45e31ff74c9fc/src/lib/services/create-flashcard.ts#L53-L55) — create fails closed on empty insert
- [`src/lib/services/flashcard-row.ts:23-37`](https://github.com/yelenkovsky/10x-devs/blob/bafa12bcc77411d7e48490cbe8c45e31ff74c9fc/src/lib/services/flashcard-row.ts#L23-L37) — shared mapper (do not copy as persist oracle)
- [`src/components/cards/PasteGenerate.tsx:88-125`](https://github.com/yelenkovsky/10x-devs/blob/bafa12bcc77411d7e48490cbe8c45e31ff74c9fc/src/components/cards/PasteGenerate.tsx#L88-L125) — fetch; error path does not prepend; 200 prepends body
- [`src/components/cards/PasteGenerate.tsx:188-200`](https://github.com/yelenkovsky/10x-devs/blob/bafa12bcc77411d7e48490cbe8c45e31ff74c9fc/src/components/cards/PasteGenerate.tsx#L188-L200) — progress panel while generating
- [`src/components/hooks/useElapsedSeconds.ts:1-25`](https://github.com/yelenkovsky/10x-devs/blob/bafa12bcc77411d7e48490cbe8c45e31ff74c9fc/src/components/hooks/useElapsedSeconds.ts#L1-L25) — elapsed seconds, no 2s gate
- [`src/lib/services/review-session.ts:120-126`](https://github.com/yelenkovsky/10x-devs/blob/bafa12bcc77411d7e48490cbe8c45e31ff74c9fc/src/lib/services/review-session.ts#L120-L126) — due queue is owner + `kept`
- [`src/pages/review.astro:14-20`](https://github.com/yelenkovsky/10x-devs/blob/bafa12bcc77411d7e48490cbe8c45e31ff74c9fc/src/pages/review.astro#L14-L20) — review SSR
- [`astro.config.mjs:39-58`](https://github.com/yelenkovsky/10x-devs/blob/bafa12bcc77411d7e48490cbe8c45e31ff74c9fc/astro.config.mjs#L39-L58) — `output: "server"`, Cloudflare adapter
- [`wrangler.jsonc:4-5`](https://github.com/yelenkovsky/10x-devs/blob/bafa12bcc77411d7e48490cbe8c45e31ff74c9fc/wrangler.jsonc#L4-L5) — `nodejs_compat`; no `cpu_ms`
- [`package.json:5-13`](https://github.com/yelenkovsky/10x-devs/blob/bafa12bcc77411d7e48490cbe8c45e31ff74c9fc/package.json#L5-L13) — no `test` script
- [`.github/workflows/ci.yml:19-21`](https://github.com/yelenkovsky/10x-devs/blob/bafa12bcc77411d7e48490cbe8c45e31ff74c9fc/.github/workflows/ci.yml#L19-L21) — lint + build only

## Architecture Insights

- **Defense in depth is uneven.** Writes and browse/review repeat `user_id` in the query. The dashboard inbox relies on RLS alone. Tests must not assume every list helper contains the same filter.
- **Anon key + RLS is the product isolation story.** `SUPABASE_KEY` is documented as the anon key. Service role would make `listFlashcards` return every row to any signed-in caller.
- **One generate = one model `fetch` + one insert.** No job table, no stream, no `waitUntil` after 200. Progress is client-side on that single request (S-01 plan).
- **Generate status is `generated`, not `kept`.** Persist-after-refresh ≠ appear-in-review.
- **Shared `toFlashcard` mapper** is used on insert select and on list. An oracle that deep-equals the insert mapper cannot fail for mapping drift.
- **S-01 verification was manual** (two-account Studio check, progress walk). That is why Phase 1 exists.

## Historical Context (from prior changes)

- [`context/changes/paste-generate-typical-use/plan.md`](https://github.com/yelenkovsky/10x-devs/blob/bafa12bcc77411d7e48490cbe8c45e31ff74c9fc/context/changes/paste-generate-typical-use/plan.md) — RLS with `(select auth.uid())`; persist immediately as `generated`; progress is client-side; paste is not a column; 55s `AbortSignal.timeout`; isolation verified in Studio, not automated.
- [`context/changes/paste-generate-typical-use/reviews/impl-review.md`](https://github.com/yelenkovsky/10x-devs/blob/bafa12bcc77411d7e48490cbe8c45e31ff74c9fc/context/changes/paste-generate-typical-use/reviews/impl-review.md) — F1 silent `[]` on list error (fixed: throw + `loadError`); F3 extracted `listFlashcards` as inbox helper (RLS isolation, no paste column).
- [`context/changes/browse-flashcards/plan.md`](https://github.com/yelenkovsky/10x-devs/blob/bafa12bcc77411d7e48490cbe8c45e31ff74c9fc/context/changes/browse-flashcards/plan.md) — Inbox isolation is RLS; browse **always** `.eq("user_id", userId)` from `locals.user.id`. Manual isolation walk (2.15) still open in that review.
- [`context/changes/srs-review-session/research.md`](https://github.com/yelenkovsky/10x-devs/blob/bafa12bcc77411d7e48490cbe8c45e31ff74c9fc/context/changes/srs-review-session/research.md) — RLS owner-only; `listFlashcards` is inbox not queue; generate inserts `generated`.
- `context/archive/` — no archived research. `context/foundation/lessons.md` — absent.

## Related Research

- [`context/changes/srs-review-session/research.md`](https://github.com/yelenkovsky/10x-devs/blob/bafa12bcc77411d7e48490cbe8c45e31ff74c9fc/context/changes/srs-review-session/research.md) — FSRS/S-04 compatibility; useful for “do not use review as generate persist oracle.”

## Open Questions

1. **Will implement hit #15878 on this `astro@6.3.1` + `@astrojs/cloudflare@13.5.0` pair?** Pin Vitest 4.1.x first; keep the adapter-override fallback in the plan’s first sub-phase, verified by actually running `vitest run`.
2. **Local Supabase in Phase 1 vs deferred to CI Phase 3.** Isolation tests without Postgres re-create the anti-pattern. Prefer local `npx supabase` for Phase 1 implement; CI can wait until Phase 3 if Docker is the blocker — but then Phase 1 must not claim isolation is proven in GitHub Actions.
3. **Product call on 200 + `cards: []`.** Lock current contract (200, no persist) vs fail closed like `createFlashcard`. Tests should state which oracle they use.
4. **Free-plan 10ms CPU** is a residual production concern for SSR, not a Phase 1 Vitest case.
5. **OpenRouter sees the paste** (third party). Out of Risk #1’s account-isolation scope.

## Response-guidance scorecard (for `/10x-plan`)

| Risk | Prove (corrected) | Must challenge (corrected) | Grounded context | Cheapest layer | Anti-pattern |
|------|-------------------|----------------------------|------------------|----------------|--------------|
| #1 | A’s dashboard/browse/review never contain B’s card ids/phrases; generate persists `user_id = A` only. Paste: no stored paste / no paste in list DTOs. | Session existence ≠ row ownership. Inbox list has no app `user_id` filter. | RLS + anon SSR client; `listFlashcards` RLS-only; browse/review extra `.eq`; generate `locals.user.id` | Integration vs real RLS (two users) | Mock the store; assert `.eq("user_id")` on `listFlashcards` |
| #2 | In-flight generate shows status + elapsed; timeout/5xx do not prepend cards or persist. | Vitest `node` ≠ workerd. 200 + `cards: []` is not a clean failure. | 55s `AbortSignal.timeout`; client progress panel; persist after model success only | Integration (mocked `fetch`) + unit on progress visibility (not a 2s gate) | Live model; Playwright happy path; Workers harness first |
| #3 | After generate, a **new** `listFlashcards`/`listBrowseFlashcards` for that user contains the fixture cards. | HTTP **200** ≠ non-empty deck. | Persist-then-200; empty persist allowed; island does not refetch; review is `kept`-only | Integration; independent list oracle | Happy-path insert only; `expect(list).toEqual(toFlashcard(inserted))` |

## Follow-up Research 2026-09-13T21:25:00Z

Parallel deep-reads ([Ground Risk #1 isolation](e1d990bb-0e33-4de8-9808-e99463ec1ecc), [Ground Risk #2 generate](fd6b741f-3a60-4594-b9e5-75ace02c2a61), [Ground Risk #3 persist](df1f5df5-6076-4798-8bd4-7ee1d8a14344), [Stack history and tests](ace72152-226e-4e3d-884b-265be7e2a247)) agree with the scorecard above. Net-new facts for `/10x-plan`:

### Installed versions (lockfile, not `package.json` ranges)

- Resolved `astro` is **6.4.8** (declared `^6.3.1`). `@astrojs/cloudflare` is **13.5.0**.
- `vitest@5.0.0` is already on disk as a **Stryker peer** (`peer: true` in the lockfile). It is **not** a first-class `package.json` dependency and there is still no `test` script. Phase 1 must **declare** Vitest (5.x is fine vs the Astro 6 floor of ≥3.2 / 4.1-beta.5); do not rely on the peer remaining.
- Installed `getViteConfig` maps Vite `command === "serve"` → Astro `"dev"`, else **`"build"`**. `vitest run` typically takes the **build** path and still loads `astro.config.mjs` including `adapter: cloudflare()`. That is the #15878-class crash vector. Container API is `experimental_AstroContainer` from `astro/container`; there is **no** `experimental.container` Astro config key. Isolation/persist tests do not need Container.
- Open question 1 above should read: **6.4.8 + Cloudflare 13.5.0 + a declared Vitest 5.x**, verified by actually running `vitest run`.

### Risk #1 additions

- `dashboard.astro` never reads `Astro.locals.user`. Middleware only requires that *someone* is signed in; the inbox query has no owner argument.
- If RLS is bypassed (service-role key) but browse/review/mutate keep `.eq("user_id")`, User A can **see** B’s cards on the dashboard and still get 404 on mutate/grade. Phase 1 must hit **`listFlashcards`**, not only browse.
- `supabase/config.toml` sets `sql_paths = ["./seed.sql"]` and `enable_anonymous_sign_ins = false`. **`supabase/seed.sql` is not in the repo.** Isolation fixtures must be created by the suite (Auth admin / `signInWithPassword`), not assumed from seed.
- S-02 impl-review F3: `requireUser` must treat `undefined` as 401 (`if (!locals.user)`). Current code does. Test stubs that leave `locals.user` unset should still 401.

### Risk #2 additions

- Browser `fetch` in `PasteGenerate` has **no `AbortSignal`**. Only the OpenRouter `fetch` has the 55s timeout. A hung persist (or a Worker that never returns) leaves `isGenerating` true and Generate disabled — a freeze of the action. Do not unit a 2s gate; an optional island test can keep `fetch` pending and assert the panel.
- Hosted **Workers Free 10 ms CPU → Error 1102** is the real local-vs-production delta (`context/foundation/infrastructure.md`, `context/deployment/deploy-plan.md`: stay Free until SSR CPU exceeds 10 ms). Local workerd does **not** enforce that cap. Still not a Phase 1 Workers-harness item; do not pretend a Node-env test proves 1102.
- If workerd names the abort `AbortError` instead of `TimeoutError`, the route still returns 503 (`generation_unavailable`), not 200.
- Insert that succeeds but whose RETURNING rows fail `flashcardRowSchema` throws 503 **after** write (error + rows exist). That is Risk #3-adjacent, not a hang.

### Risk #3 additions

- Two legal empty-200 shapes: model `{ cards: [] }` (`failedCount: 0`, no insert) and all-invalid cards (`failedCount: N`, no insert). Both must keep the independent list count unchanged.
- Empty RETURNING after a claimed-ok insert (`safeParse([])` succeeds) would 200 with `cards: []` **and then populate on refresh** — the **opposite** of “success then empty deck.” Do not use that as the Risk #3 happy-path oracle; it is a generate/create asymmetry (`createFlashcard` already 503s on empty data).
- Classic PostgREST “INSERT ok, SELECT RLS hides RETURNING” would also 200-empty **then show rows on refresh**. Unlikely while INSERT and SELECT policies both use `auth.uid() = user_id`.
- `/cards?status=kept` and `/review` empty after generate are **wrong oracles**, not persist bugs.

No further §2 backport. These refine implement/plan fixtures, they do not change the already-corrected response guidance.
