---
date: 2026-09-13T17:58:39+00:00
researcher: agent
git_commit: 0ace5d30c939970ba40722ad9d4147f41177a5df
branch: main
repository: 10x-devs
topic: "Is context/changes/ts-fsrs-api-docs.md compatible with this codebase for S-04?"
tags: [research, codebase, ts-fsrs, srs, flashcards, s-04]
status: complete
last_updated: 2026-09-13
last_updated_by: agent
---

# Research: Is `ts-fsrs-api-docs.md` compatible with this codebase for S-04?

**Date**: 2026-09-13T17:58:39+00:00
**Researcher**: agent
**Git Commit**: `0ace5d30c939970ba40722ad9d4147f41177a5df`
**Branch**: main
**Repository**: 10x-devs

## Research Question

Review the codebase and decide whether [`context/changes/ts-fsrs-api-docs.md`](https://github.com/yelenkovsky/10x-devs/blob/0ace5d30c939970ba40722ad9d4147f41177a5df/context/changes/ts-fsrs-api-docs.md) is compatible with it, so we can implement S-04 (`srs-review-session` / FR-008) from [`context/foundation/roadmap.md`](https://github.com/yelenkovsky/10x-devs/blob/0ace5d30c939970ba40722ad9d4147f41177a5df/context/foundation/roadmap.md).

## Summary

**The library API in those notes is compatible. The four-step wiring checklist is not a drop-in.**

`createEmptyCard()`, `fsrs()`, `repeat()`, `next()`, and `Rating` 1–4 are the right ready-made scheduler for FR-008. The package is storage-agnostic, JSON-serializable, and safe on an Astro API route on Cloudflare Workers (`nodejs_compat` is already on). That matches the stack and the PRD Non-Goal of not writing a custom algorithm.

The notes cannot be followed as if the schema and keep path already store FSRS state. Live `public.flashcards` is content + `generated`/`kept` only. `ts-fsrs` is not in `package.json`. S-03 keep/edit writes `status: "kept"` and nothing else. There is no `/review` page, no due queue, no grade UI, and no review log. Existing `kept` rows have no `due`.

Use the notes as the **scheduler contract**. S-04 still owns: a migration, init timing (lazy first review is the path that matches shipped keep), a `kept AND due <= now` queue that ignores `generated`, server-side `next()` (do not persist a client-computed card), and an un-keep reset the notes do not mention.

S-03 is implemented (`gate-generated-cards` `status: implemented`). The roadmap handoff still says S-04 is “not ready / waits on S-03”; treat change-folder + plan Progress as implementation truth.

## Detailed Findings

### Verdict matrix

| Notes claim | Compatible? | Why |
| --- | --- | --- |
| Use official `ts-fsrs` (`createEmptyCard` / `repeat` / `next` / `Rating` 1–4) | **Yes** | Ready-made FSRS-6; 0 runtime deps; Workers-safe; matches FR-008 |
| Default `fsrs()`, no parameter training | **Yes** | Matches Non-Goal and prior library survey |
| Persist Card fields (`due`, `stability`, `difficulty`, `state`, `reps`, …) | **API yes, schema no** | Fields are the right persist shape; table/DTOs do not have them |
| Optional `ReviewLog` | **Optional / absent** | Fine to skip for MVP; no table today |
| Queue is `due <= now` on kept cards; `ts-fsrs` does not own the queue | **Yes (design)** | Must be a new query; `listFlashcards` is the inbox, not the queue |
| On keep: write `createEmptyCard()` columns | **Intent yes, code no** | S-03 deferred this; keep is status-only; notes already allow “or first review” |
| Island runs `repeat()`; `next()` on submit; POST saves `result.card` | **Partial mismatch** | Island + POST fit; **server** must run `next()` and persist. Do not trust client-computed state |
| Dates via `afterHandler` millis | **Compatible with mapping** | Prefer `timestamptz` + ISO on the wire; millis is optional |

### Card schema (what exists)

One table, one migration: [`supabase/migrations/20260913152707_create_flashcards.sql`](https://github.com/yelenkovsky/10x-devs/blob/0ace5d30c939970ba40722ad9d4147f41177a5df/supabase/migrations/20260913152707_create_flashcards.sql#L1-L14).

Columns: `id`, `user_id`, `generation_id`, `status` (`generated` \| `kept`), six cloze fields, `created_at`. RLS is owner-only for `authenticated` ([lines 20–48](https://github.com/yelenkovsky/10x-devs/blob/0ace5d30c939970ba40722ad9d4147f41177a5df/supabase/migrations/20260913152707_create_flashcards.sql#L20-L48)). Indexes are on `user_id` / `created_at` / `generation_id` — not `due`.

App DTO [`src/types.ts`](https://github.com/yelenkovsky/10x-devs/blob/0ace5d30c939970ba40722ad9d4147f41177a5df/src/types.ts#L1-L15) and row mapper [`src/lib/services/flashcard-row.ts`](https://github.com/yelenkovsky/10x-devs/blob/0ace5d30c939970ba40722ad9d4147f41177a5df/src/lib/services/flashcard-row.ts#L4-L19) select those 11 columns only.

**Name collision:** `flashcards.status` is product lifecycle. ts-fsrs `state` is `New` \| `Learning` \| `Review` \| `Relearning`. Do not overload `status`.

ts-fsrs `Card` (Context7 `/open-spaced-repetition/ts-fsrs`, types doc) that S-04 must persist:

- `due`, `last_review?`
- `stability`, `difficulty`
- `state`, `reps`, `lapses`
- `scheduled_days`, `learning_steps`
- `elapsed_days` (deprecated in FSRS-6; persist if `next()` still returns it)

None of those exist in SQL or TypeScript.

### Keep / accept path (where `createEmptyCard()` would hook)

S-01 insert always writes `status: "generated"` ([`generate-cards.ts` persist](https://github.com/yelenkovsky/10x-devs/blob/0ace5d30c939970ba40722ad9d4147f41177a5df/src/lib/services/generate-cards.ts)).

A card becomes kept only via `POST /api/cards/:id` ([`src/pages/api/cards/[id].ts`](https://github.com/yelenkovsky/10x-devs/blob/0ace5d30c939970ba40722ad9d4147f41177a5df/src/pages/api/cards/%5Bid%5D.ts#L7-L22)):

- `{ action: "keep" }` → `{ status: "kept" }`
- `{ action: "edit", …six fields }` → fields + `{ status: "kept" }` (generated→kept or kept→kept)
- `{ action: "unkeep" }` → `{ status: "generated" }`
- `{ action: "delete" }` → hard DELETE

Service: [`src/lib/services/mutate-flashcard.ts`](https://github.com/yelenkovsky/10x-devs/blob/0ace5d30c939970ba40722ad9d4147f41177a5df/src/lib/services/mutate-flashcard.ts#L55-L77). No SELECT-before-write. Keep-on-kept and edit-of-kept also write `status: "kept"`.

UI: [`FlashcardItem.tsx`](https://github.com/yelenkovsky/10x-devs/blob/0ace5d30c939970ba40722ad9d4147f41177a5df/src/components/cards/FlashcardItem.tsx#L251-L272) Accept / Un-keep on `/dashboard`.

S-03 plan stated this on purpose: “Status is the only study signal this slice writes… Ready-made SRS stays in S-04” ([`gate-generated-cards/plan.md`](https://github.com/yelenkovsky/10x-devs/blob/0ace5d30c939970ba40722ad9d4147f41177a5df/context/changes/gate-generated-cards/plan.md#L5)). Brief: “FSRS on accept = Status only / S-04 owns scheduler init” ([`plan-brief.md`](https://github.com/yelenkovsky/10x-devs/blob/0ace5d30c939970ba40722ad9d4147f41177a5df/context/changes/gate-generated-cards/plan-brief.md#L28)).

The notes’ “On keep: `createEmptyCard()` columns” is the **intended** hook, not the **shipped** one. The same notes already allow **first review** as the other init site ([`ts-fsrs-api-docs.md` L9](https://github.com/yelenkovsky/10x-devs/blob/0ace5d30c939970ba40722ad9d4147f41177a5df/context/changes/ts-fsrs-api-docs.md#L9)). That second path matches existing `kept` rows.

**Do not** call `createEmptyCard()` on every `status: "kept"` patch (re-keep, edit-of-kept). Init only when becoming kept and scheduler state is empty, **or** lazily on first `next()`.

**Un-keep** is in the product and not in the notes. S-03 assigned the reset to S-04 ([`plan.md` L239](https://github.com/yelenkovsky/10x-devs/blob/0ace5d30c939970ba40722ad9d4147f41177a5df/context/changes/gate-generated-cards/plan.md#L239)). If FSRS columns live on the row, un-keep must null/reset them; re-keep or first review re-inits.

### Session / API / UI (what S-04 must add)

Architecture fit is good. Pattern to copy: SSR page + `client:load` island + cookie JSON API + `requireUser` + zod + `src/lib/services/`.

| Needed for S-04 | Today |
| --- | --- |
| Protected HTML review surface | Only `/dashboard` in [`PROTECTED_ROUTES`](https://github.com/yelenkovsky/10x-devs/blob/0ace5d30c939970ba40722ad9d4147f41177a5df/src/lib/auth.ts#L3) ([`middleware.ts`](https://github.com/yelenkovsky/10x-devs/blob/0ace5d30c939970ba40722ad9d4147f41177a5df/src/middleware.ts#L21-L26)) |
| Due queue | [`listFlashcards`](https://github.com/yelenkovsky/10x-devs/blob/0ace5d30c939970ba40722ad9d4147f41177a5df/src/lib/services/list-flashcards.ts#L25-L35) loads **all** statuses, `created_at` desc |
| JSON GET | **None** — card APIs are POST only (`generate`, `[id]`) |
| Grade POST | **None** |
| Again / Hard / Good / Easy | **None** — gate buttons only |
| `ts-fsrs` dependency | **Absent** ([`package.json`](https://github.com/yelenkovsky/10x-devs/blob/0ace5d30c939970ba40722ad9d4147f41177a5df/package.json#L15-L37)) |

Workers: [`wrangler.jsonc`](https://github.com/yelenkovsky/10x-devs/blob/0ace5d30c939970ba40722ad9d4147f41177a5df/wrangler.jsonc#L1-L6) already has `nodejs_compat`. `ts-fsrs` is Rollup-built JS, no NAPI/WASM. Do not add `@open-spaced-repetition/binding` or `fsrs-browser`.

Review island should follow `PasteGenerate` (`client:load` + `fetch` + `credentials: "same-origin"`), **not** the auth forms (those are not hydrated; see S-01 impl-review). Add `/review` to `PROTECTED_ROUTES` in `src/lib/auth.ts` (not a second list in middleware). JSON routes stay off that list and use `requireUser`.

### Notes vs this repo: `repeat()` / `next()` placement

[`ts-fsrs-api-docs.md` S-04 wiring](https://github.com/yelenkovsky/10x-devs/blob/0ace5d30c939970ba40722ad9d4147f41177a5df/context/changes/ts-fsrs-api-docs.md#L92-L97):

1. On keep: `createEmptyCard()` columns.
2. Session GET: `due <= now`.
3. Island: `repeat()` for interval labels; `next()` on submit.
4. POST: save `result.card` (and optionally `result.log`).

Steps 1–2 need new schema + a new query (`status = 'kept' AND due <= now()`). Step 3–4 as written invite **client-side `next()` + persist whatever the island sends**.

This codebase’s JSON writes always apply the mutation **on the server** after zod (`mutateFlashcard`, `generateCards`). Prior S-04 library notes said: run the scheduler on the Worker. **Compatible plan:** POST `{ cardId, grade: 1–4 }` → service loads the row, `createEmptyCard()` if needed, `fsrs().next(card, now, grade)`, writes `result.card`. `repeat()` may run on the server (return four labels on GET) or in the island for labels only — never persist a client `Card`.

`FSRSValidationError` on grade `0` / `Rating.Manual` maps cleanly to zod `z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)])` or `z.enum` of those values.

### Date mapping

Notes show `afterHandler` turning `Date` into millis. Postgres here uses `timestamptz` (`created_at`). Prefer:

- Columns: `timestamptz` for `due` / `last_review`
- `TypeConvert` / `CardInput` already accept Date, timestamp, or ISO
- Wire format: ISO strings (same as `createdAt` on `Flashcard`) unless a single JSON blob is stored

Millis is compatible but a second date convention. Do not mix millis in JSON with `timestamptz` without an explicit mapper.

### Prerequisite and roadmap status

| Slice | change.md | Code |
| --- | --- | --- |
| S-01 `paste-generate-typical-use` | `impl_reviewed` | Generate + persist `generated` |
| S-03 `gate-generated-cards` | `implemented` | Keep / unkeep / edit / delete |
| S-04 `srs-review-session` | `preparing` (this research) | Notes + this document only |

Roadmap table still lists S-01/S-03 `in-progress` and S-04 not ready for `/10x-plan`. Gate is in the tree. S-05 manual create is still proposed: `generation_id` is `NOT NULL` with no default; a later insert-as-kept path needs the same FSRS init helper.

## Code References

- [`supabase/migrations/20260913152707_create_flashcards.sql:1-14`](https://github.com/yelenkovsky/10x-devs/blob/0ace5d30c939970ba40722ad9d4147f41177a5df/supabase/migrations/20260913152707_create_flashcards.sql#L1-L14) — content + `generated`/`kept` only
- [`src/types.ts:1-36`](https://github.com/yelenkovsky/10x-devs/blob/0ace5d30c939970ba40722ad9d4147f41177a5df/src/types.ts#L1-L36) — `Flashcard` and mutate actions; no scheduler DTO
- [`src/lib/services/flashcard-row.ts:4-19`](https://github.com/yelenkovsky/10x-devs/blob/0ace5d30c939970ba40722ad9d4147f41177a5df/src/lib/services/flashcard-row.ts#L4-L19) — persist contract for generate/list/mutate
- [`src/lib/services/mutate-flashcard.ts:55-77`](https://github.com/yelenkovsky/10x-devs/blob/0ace5d30c939970ba40722ad9d4147f41177a5df/src/lib/services/mutate-flashcard.ts#L55-L77) — keep/unkeep/edit writes
- [`src/lib/services/list-flashcards.ts:25-35`](https://github.com/yelenkovsky/10x-devs/blob/0ace5d30c939970ba40722ad9d4147f41177a5df/src/lib/services/list-flashcards.ts#L25-L35) — inbox query, not a due queue
- [`src/pages/api/cards/[id].ts:7-50`](https://github.com/yelenkovsky/10x-devs/blob/0ace5d30c939970ba40722ad9d4147f41177a5df/src/pages/api/cards/%5Bid%5D.ts#L7-L50) — zod + `requireUser` + POST-only mutate
- [`src/lib/auth.ts:3`](https://github.com/yelenkovsky/10x-devs/blob/0ace5d30c939970ba40722ad9d4147f41177a5df/src/lib/auth.ts#L3) — `PROTECTED_ROUTES = ["/dashboard"]`
- [`src/middleware.ts:21-26`](https://github.com/yelenkovsky/10x-devs/blob/0ace5d30c939970ba40722ad9d4147f41177a5df/src/middleware.ts#L21-L26) — HTML guest redirect; JSON uses `requireUser`
- [`wrangler.jsonc:5`](https://github.com/yelenkovsky/10x-devs/blob/0ace5d30c939970ba40722ad9d4147f41177a5df/wrangler.jsonc#L5) — `nodejs_compat`
- [`src/pages/dashboard.astro:44`](https://github.com/yelenkovsky/10x-devs/blob/0ace5d30c939970ba40722ad9d4147f41177a5df/src/pages/dashboard.astro#L44) — only product island; no review route
- [`context/changes/ts-fsrs-api-docs.md:7-97`](https://github.com/yelenkovsky/10x-devs/blob/0ace5d30c939970ba40722ad9d4147f41177a5df/context/changes/ts-fsrs-api-docs.md#L7-L97) — scheduler API + wiring sketch
- [`context/foundation/roadmap.md:134-144`](https://github.com/yelenkovsky/10x-devs/blob/0ace5d30c939970ba40722ad9d4147f41177a5df/context/foundation/roadmap.md#L134-L144) — S-04 outcome and Non-Goal

## Architecture Insights

- **Two statuses, two layers.** `generated`/`kept` is the gate. FSRS `state` is memory. Review query: `status = 'kept' AND due <= now()`. Never reuse `listFlashcards` for study.
- **Scheduler on the Worker.** Same as generate: island `fetch`es, service mutates, RLS + `.eq("user_id")` + empty `.select()` → 404.
- **Init policy that fits shipped data.** Lazy `createEmptyCard()` on first review (or migrate + backfill all `kept`) avoids rewriting the closed S-03 keep path. If keep is also patched, init only on `generated → kept` when FSRS fields are null.
- **Columns on the card row vs 1:1 child.** Either works. Same-row columns are fewer joins for `due <= now`. Optional `review_logs` is a second table if history is wanted; MVP can skip it.
- **`FLASHCARD_COLUMNS` is the choke point.** Generate, list, and mutate share it. Adding FSRS fields requires mapper + DTO + island zod (`PasteGenerate` / `FlashcardItem` duplicate the content schema) or a slimmer review DTO so the dashboard island does not need scheduler fields.
- **Default `fsrs()` is enough.** No training, no optimizer packages, no custom weights.
- **S-05 later.** Insert-as-kept (or dummy `generation_id`) must call the same init helper.

## Historical Context (from prior changes)

The library survey lives in `library-survey.md` (same change, 2026-09-13, method: exa-web-search; restored from `d2c9293`). Recommendation **stands: `ts-fsrs`**. Official Open Spaced Repetition FSRS-6, ESM/CJS, ~0 runtime deps, `createEmptyCard` / `repeat` / `next` API. Fallback if the slice wants three numbers only: `supermemo` (SM-2). Rejected for this stack: `@open-spaced-repetition/binding` (NAPI), `fsrs-browser` (WASM trainer), `rs-fsrs-nodejs`, Nest/Prisma engines, Anki.

That survey also said: run the scheduler on the server; persist `due` + algorithm state; queue `due <= now()`; **on S-03 accept, store `createEmptyCard()`**. S-03 later **overrode** the last sentence — keep is status-only (`gate-generated-cards/plan.md`, `plan-brief.md` L28). The API notes’ “or first review” is the reconciliation.

- [`context/changes/gate-generated-cards/plan.md`](https://github.com/yelenkovsky/10x-devs/blob/0ace5d30c939970ba40722ad9d4147f41177a5df/context/changes/gate-generated-cards/plan.md) — FSRS out of scope; ignore `generated`; reset scheduler on un-keep
- [`context/changes/gate-generated-cards/plan-brief.md`](https://github.com/yelenkovsky/10x-devs/blob/0ace5d30c939970ba40722ad9d4147f41177a5df/context/changes/gate-generated-cards/plan-brief.md) — “S-04 owns scheduler init”
- [`context/changes/paste-generate-typical-use/plan.md`](https://github.com/yelenkovsky/10x-devs/blob/0ace5d30c939970ba40722ad9d4147f41177a5df/context/changes/paste-generate-typical-use/plan.md) — SRS out of S-01; persist as `generated`
- [`context/foundation/prd.md`](https://github.com/yelenkovsky/10x-devs/blob/0ace5d30c939970ba40722ad9d4147f41177a5df/context/foundation/prd.md) — FR-008 must-have; custom algorithm Non-Goal
- `context/archive/` — no prior SRS research

## Related Research

- [`library-survey.md`](./library-survey.md) — S-04 ready-made SRS library survey; recommendation `ts-fsrs`
- [`context/changes/ts-fsrs-api-docs.md`](https://github.com/yelenkovsky/10x-devs/blob/0ace5d30c939970ba40722ad9d4147f41177a5df/context/changes/ts-fsrs-api-docs.md) — Context7 excerpts for `ts-fsrs` (not a change-folder identity file)

## Open Questions

1. **Init timing:** lazy on first review (fits existing `kept` rows) vs migrate+backfill vs also patch S-03 keep/edit. Recommend lazy or backfill; do not require an S-03 reopen.
2. **Same-row columns vs 1:1 `flashcard_fsrs` table.** Same-row is enough for MVP queue performance.
3. **Persist `ReviewLog`?** Notes mark it optional. Skip for first session unless we want a history table immediately.
4. **Interval labels:** server `repeat()` on GET vs client `repeat()` for display only.
5. **Un-keep reset:** null FSRS columns vs delete child row vs leave state but exclude via `status = 'generated'`.
6. **Roadmap hygiene:** mark S-03 done and S-04 ready for `/10x-plan` when planning starts.
7. **`lessons.md`** is not present; no registered priors.

## Planning implications (S-04)

If `/10x-plan srs-review-session` runs next, the notes are a valid **algorithm** source. The plan still needs:

1. Add `ts-fsrs`; new migration (`YYYYMMDDHHmmss_*.sql`) with RLS; extend mapper/DTOs.
2. Choose init: lazy first review and/or keep-path + backfill.
3. `src/pages/review.astro` + `/review` in `PROTECTED_ROUTES`.
4. Service + `GET`/`POST` (`prerender = false`, `requireUser`, zod grade 1–4).
5. Island: cloze then grades; empty queue state.
6. Filter `generated`; reset or ignore FSRS on un-keep.
7. Do not train parameters; do not persist client-computed `result.card` as the source of truth.
