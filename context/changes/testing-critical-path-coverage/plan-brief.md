# Critical-path coverage — Plan Brief

> Full plan: `context/changes/testing-critical-path-coverage/plan.md`
> Research: `context/changes/testing-critical-path-coverage/research.md`

## What & Why

Phase 1 of `context/foundation/test-plan.md` bootstraps Vitest and proves the three highest-risk generate/isolation contracts. User A must never see User B’s cards (paste is not stored). A slow or failed generate must show progress and must not look like a save. HTTP 200 after generate must be checked against a **new** list, not trusted as “the deck is populated.”

## Starting Point

No runner, no test files, CI is lint+build only. Isolation is RLS + anon SSR client; dashboard `listFlashcards` has no app `user_id` filter. Generate persists after a 55s-bounded OpenRouter call and returns 200 (including `cards: []`). Progress is an immediate client panel. Review is kept+due only.

## Desired End State

`npm test` is green locally. With Supabase up, the suite proves two-user RLS isolation, generate timeout/5xx leave the deck unchanged, and a mocked-model generate shows up on a new inbox/browse list. §6 of the test plan tells the next author how to add the same kind of test. Product empty-200 behavior is unchanged. CI still does not run tests (rollout Phase 3).

## Key Decisions Made

| Decision               | Choice                                                      | Why (1 sentence)                                                                       | Source               |
| ---------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------- |
| Isolation environment  | Local Supabase required; suite **fails** if DB is down      | A mocked store cannot prove RLS                                                        | Plan (Q1)            |
| Empty generate success | Lock current `200` + `cards: []`; no product change         | Test rollout, not a generate rewrite                                                   | Plan (Q2)            |
| Isolation surfaces     | Inbox + browse + non-vacuous review (B has kept+due)        | Matches prove-protection; review needs a kept seed or it is vacuous                    | Plan (Q3) + Research |
| Guest fence            | One unauthenticated generate **401**                        | Cheap; bind-after-signup stays Phase 2                                                 | Plan (Q4)            |
| Progress units         | Hook + in-flight `role="status"` + 5xx does not prepend     | Covers UI half of Risk #2 without a 2s gate                                            | Plan (Q5) + Research |
| “No write” oracle      | New `listFlashcards(A)` unchanged                           | Write-spy re-opens the mock-store anti-pattern                                         | Plan (Q6)            |
| Inbox vs filter        | Do not assert `.eq` on `listFlashcards`                     | That helper has no owner filter; RLS is the mechanism                                  | Research             |
| Node ≠ Worker          | Vitest `node` ≠ workerd; no Workers plugin                  | Local `npm run dev` is already workerd; HTTP Workers have no wall-clock duration limit | Research             |
| Persist oracle         | New list/browse, not generate JSON / `toFlashcard` / review | Island does not refetch; review is kept-only                                           | Research             |
| Runner                 | Vitest 5.x + `getViteConfig()` + default `node`             | Official Astro 6 path (docs checked 2026-09-13)                                        | Research + Plan      |

## Scope

**In scope:** Vitest bootstrap; progress units; two-user RLS isolation; generate failure × unchanged list; persist-then-list; lock empty-200; generate 401 fence; test-plan §6 (+ AGENTS.md “no runner” line).

**Out of scope:** Playwright; live model; Workers harness; CI test job; Risks #4–#6; fail-closed product change; Stryker; marketing chrome; paste-in-list as an oracle.

## Architecture / Approach

Services + two `@supabase/supabase-js` anon clients (A/B `signUp`). Mock `fetch` only for `https://openrouter.ai/api/v1/chat/completions` and pass through Supabase. jsdom only on hook/island files. Isolation probes A’s JWT with `userId: B` on browse/review so the test hits RLS, not a filter copy. Fixtures are independent phrases; assertions prefer **ids**.

## Phases at a Glance

| Phase                   | What it delivers                                | Key risk                                                       |
| ----------------------- | ----------------------------------------------- | -------------------------------------------------------------- |
| 1. Bootstrap Vitest     | `npm test` green via `getViteConfig()`          | Astro 6.4.8 + CF 13.5.0 + Vitest 5 `#15878` crash              |
| 2. Progress units       | Status + elapsed; no prepend on 5xx             | Fake timers vs pending `fetch` flakiness                       |
| 3. RLS isolation        | A never lists B’s ids; generate cannot own as B | Docker/Supabase down; service-role key false-fails (correctly) |
| 4. Failure × no persist | Timeout/5xx/JSON + 401                          | Accidental global `fetch` mock hiding Supabase                 |
| 5. Persist-then-list    | New list has fixtures; empty-200 locked         | Using generate JSON or review as oracle                        |
| 6. Cookbook §6          | Patterns for the next test                      | Cookbook too vague to copy                                     |

**Prerequisites:** Docker + `npx supabase start` from Phase 3 on; `SUPABASE_URL` + anon `SUPABASE_KEY`; Node 22.14.0.
**Estimated effort:** ~2–3 sessions across 6 phases.

## Open Risks & Assumptions

- `vitest run` may still need the `astro:server` filter or an adapter override; implement verifies, Phase 6 records which.
- Isolation is proven on the developer machine, not in GitHub Actions, until rollout Phase 3.
- Empty RETURNING-after-insert remains a documented generate/create asymmetry, not this suite’s persist success path.
- Free-plan 10 ms CPU / Error 1102 stays a production residual, not a Phase 1 case.

## Success Criteria (Summary)

- A cannot see B’s card ids on inbox, browse, or review; generate cannot persist another owner; paste is not a stored field.
- Failed generate shows a clean error, does not prepend cards, and does not add rows.
- After a successful mocked generate, a **new** list/browse for that user returns the fixture cards.
