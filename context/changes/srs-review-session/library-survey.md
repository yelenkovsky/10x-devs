---
topic: Ready-made TypeScript SRS libraries compatible with Astro 6 + React 19 + Supabase + Cloudflare Workers
researcher: agent
change_id: srs-review-session
roadmap_id: S-04
created: 2026-09-13
updated: 2026-09-13
method: exa-web-search
recommendation: ts-fsrs
---

# Research: S-04 ready-made SRS libraries

Survey of npm/TypeScript spaced-repetition libraries that can implement S-04 (`srs-review-session`) without fighting `context/foundation/tech-stack.md`.

S-04 outcome: the learner reviews kept flashcards with a **ready-made** algorithm (FR-008). Custom scheduling is a PRD Non-Goal. Accept/edit/delete (S-03) is a prerequisite so review uses kept cards, not raw model output.

## Compatibility criteria

| Constraint | Filter |
| --- | --- |
| TypeScript + npm | Matches Astro 6 / React 19 |
| Cloudflare Workers (`@astrojs/cloudflare`) | No Node native addons, no NAPI, no WASI-threads, no filesystem |
| Supabase Postgres | Bring-your-own-storage: plain serializable objects |
| Review UI is ours | shadcn / React island; skip engines that bring a foreign backend |

Run the scheduler **on the server** (API route, `prerender = false`, zod). Persist `due` plus algorithm state and a review log. Queue query: `due <= now()` for the signed-in user.

## Recommendation

**Use `ts-fsrs`.** Official TypeScript FSRS-6 scheduler: storage-agnostic, JSON-serializable card state, safe on an Astro API route on Workers. Build Again / Hard / Good / Easy in a small React island. Do not pull a full flashcard engine or a native optimizer.

Fallback if the slice wants the smallest possible schema (three numbers): `supermemo` (classic SM-2).

## FSRS — recommended family

### `ts-fsrs` — pick this

- Official Open Spaced Repetition scheduler (FSRS **v6**). ESM / CJS / UMD. Current `5.4.2` has **no runtime dependencies** (`package.json` is Rollup-built JS only).
- ~114k weekly downloads; published 2026-05 (npm listing) / `5.4.2` on npm as of this survey.
- API matches a review session: `createEmptyCard()`, `repeat()` to preview all four grades, `next(card, now, Rating.Good)` to apply one.
- Card + `ReviewLog` are JSON-serializable. Upstream docs suggest **zod** at the persistence boundary (already in this repo).
- Listed as the TypeScript scheduler on awesome-fsrs. Used in production by Quanta and Rember.
- `engines: node >= 20` is a Node consumer hint, not a native addon. Schedule on the Worker; do **not** add the sibling optimizer package.

### Other FSRS ports (compatible, weaker)

| Package | Algorithm | Workers? | Caveat |
| --- | --- | --- | --- |
| `@squeakyrobot/fsrs` | FSRS 4.5, optional v6 | Tagged `cloudflare-workers` / `edge-runtime`; 0 deps | One release (Dec 2025), ~68 weekly downloads — not the official port |
| `quanta-fsrs` | FSRS 4.5/5 | Claims Workers / Deno / Bun | ~2 weekly downloads; **MINT-tuned weights**, not stock FSRS |
| `srs-everything` | FSRS + queues | Pure TS, 0 deps | Extra incremental-reading / interleave APIs; ~0 downloads |
| `fsrs.js` | Older FSRS | JS | **Deprecated**; maintainers point to `ts-fsrs` |

## SM-2 — simpler, older math

Valid for FR-008. Use only if the slice prefers `interval` / `repetition` / `efactor` over FSRS stability/difficulty.

| Package | Notes |
| --- | --- |
| `supermemo` | SM-2, 0 deps, Deno/esm.sh. ~1.8k weekly; last release Mar 2025. Caller adds `dueDate` (their Day.js example). |
| `@open-spaced-repetition/sm-2` | Official OSR SM-2, JSON-serializable `Card` / `ReviewLog`. Still **0.x** (Aug 2025), tiny download count. |
| `@x1ee7/sm2-spaced-repetition` | 0 deps, bring-your-own storage. |
| `@monkey-dev-vibes/spaced-repetition` | 0 deps; documents edge / Workers. 4-button scale, not classic 0–5. Very new / unused. |
| `@dtjv/sm-2`, `spaced-repetition.js` | Unmaintained or last release 2021. Skip. |

## Rejected for this stack

| Package | Why |
| --- | --- |
| `@open-spaced-repetition/binding` | Rust NAPI optimizer. Native binaries + WASI; not for Workers. Training is out of MVP scope. |
| `fsrs-browser` | ~1.6MB WASM + rayon/threads. Trainer, not a review scheduler. |
| `rs-fsrs-nodejs` | Native Node addon. |
| `@hfu.digital/loopkit-nestjs` + `loopkit-react` | NestJS + Prisma review engine. Fights Astro SSR, Supabase, and Workers. |
| Anki / AnkiConnect / full apps | Apps, not libraries. |

No well-maintained headless React review-session package talks to Supabase without a foreign backend. Session UI stays a React island; scheduling stays in `src/lib/services/` plus a `POST` API route.

## How S-04 would use `ts-fsrs`

1. On accept (S-03), store `createEmptyCard()` fields next to the kept card in Postgres.
2. Session: load the signed-in user’s cards with `due <= now()`.
3. Island shows cloze + four grades; optionally `repeat()` for interval previews on the buttons.
4. API applies `next(card, now, rating)`, writes new card state + review log.

That is a ready-made algorithm, not a custom scheduler.

## Architecture insights (for later planning)

- Persist scheduler state on the card row (or a 1:1 child table), not in the Worker or the browser.
- Review must ignore `generated` cards; S-01 persists those before the S-03 gate.
- Do not train FSRS parameters in v1. Default `fsrs()` weights are enough.
- `repeat()` is the button-preview helper; `next()` is the write path.

## Sources

- https://github.com/open-spaced-repetition/ts-fsrs
- https://www.npmjs.com/package/ts-fsrs
- https://github.com/open-spaced-repetition/ts-fsrs/blob/main/packages/fsrs/package.json
- https://open-spaced-repetition.github.io/ts-fsrs/
- https://github.com/open-spaced-repetition/awesome-fsrs
- https://github.com/open-spaced-repetition/fsrs.js
- https://www.npmjs.com/package/@squeakyrobot/fsrs
- https://www.npmjs.com/package/quanta-fsrs
- https://www.npmjs.com/package/srs-everything
- https://www.npmjs.com/package/fsrs-browser
- https://www.npmjs.com/package/supermemo
- https://github.com/VienDinhCom/supermemo
- https://www.npmjs.com/package/@open-spaced-repetition/sm-2
- https://github.com/x1ee7/sm2-spaced-repetition
- https://github.com/Monkey-Dev-Vibes/spaced-repetition
- https://www.npmjs.com/package/@dtjv/sm-2
- https://github.com/sunyata2022/spaced-repetition.js
- https://github.com/hfu-digital/loopkit
- https://www.npmjs.com/package/@hfu.digital/loopkit-react
- https://developers.cloudflare.com/workers/runtime-apis/nodejs/
