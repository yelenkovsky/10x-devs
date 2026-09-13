# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-09-13

## 1. Strategy

Tests follow three non-negotiable principles for this project:

1. **Cost × signal.** The cheapest test that gives a real signal for the
   risk wins. Do not promote to e2e because e2e "feels safer." Do not put a
   vision model on top of a deterministic visual diff that already catches
   the regression.
2. **User concerns are first-class evidence.** Risks anchored in "<the
   team is worried about X, and the failure would surface somewhere in
   <area>>" carry the same weight as PRD lines or hot-spot data.
3. **Risks are scenarios, not code locations.** This plan documents *what
   could fail* and *why we believe it's likely* — drawn from documents,
   interview, and codebase *signal* (churn, structure, test base). It does
   NOT claim to know which line owns the failure. That knowledge is
   produced by `/10x-research` during each rollout phase. If the plan and
   research disagree about where the failure lives, research is the
   ground truth.

Hot-spot scope used for likelihood weighting: `src/pages`, `src/components`, `src/lib`, `src/middleware.ts`, `supabase/migrations`.

There is no suite today. Phase 1 bootstraps Vitest (Astro `getViteConfig()`, `node` env for Container tests) and spends the first tests on isolation and the generate failure/persist contracts. Do not call a live model in CI. Do not lead with Playwright. Do not spend budget on landing/marketing chrome. Typical-use *prose* quality is an eval problem, not a unit-test oracle; asserting the six required fields exist may ride on the generate contract.

## 2. Risk Map

The top failure scenarios this project must protect against, ordered by
risk = impact × likelihood. Risks are failure scenarios in user / business
terms, not test names. The Source column cites the *evidence that surfaced
this risk* — never a specific file as "where the failure lives" (that is
research's job, see §1 principle #3).

| # | Risk (failure scenario) | Impact | Likelihood | Source (evidence — not anchor) |
|---|-------------------------|--------|------------|--------------------------------|
| 1 | A signed-in learner sees another account’s cards (paste is request-scoped, not a stored row) | High | High | PRD guardrails + US-01 AC; roadmap S-01 isolation; hot-spot dirs `src/lib/services` (9 commits/30d), `src/pages/api` (6 commits/30d), `supabase/migrations` (RLS owner policies); inbox list is RLS-only; abuse: ownership |
| 2 | Generate hangs, times out, or looks like an empty success after a Node-env pass | High | High | interview Q2, Q3; PRD progress NFR; roadmap S-01; hot-spot dirs `src/components/cards` (7 commits/30d), `src/lib/services` (9 commits/30d); HTTP Worker wall-clock hang is not a current duration-limit failure |
| 3 | Generate reports HTTP 200 success but the learner’s deck is empty after refresh | High | Medium | PRD FR-009; roadmap S-01 persistence; hot-spot dir `src/lib` (14 commits/30d) is coarse — write + independent list is the surface |
| 4 | A signed-in user can read or mutate another account’s card by id | High | Medium | PRD “never sees another account’s cards”; S-03/S-04 shipped on mutate/review; abuse: authorization |
| 5 | An unauthenticated visitor persists a deck, or a session does not bind later cards to the registered account | High | Medium | PRD US-02, FR-001/010; roadmap S-02; hot-spot dir `src/pages/auth` (5 commits/30d) |
| 6 | A review grade looks saved but the due queue does not change | Medium | Medium | PRD FR-008; roadmap S-04; hot-spot dir `src/lib/services` (9 commits/30d) |

Secret-in-client-bundle is High × Low (AGENTS.md server-only secrets). It is a cheap CI/build check in §3 Phase 3, not a product-behavior row. Typical-use C1/C2 prose is out of the classic map (oracle problem; adjacent to interview Q5).

### Risk Response Guidance

| Risk | What would prove protection | Must challenge | Context `/10x-research` must ground | Likely cheapest layer | Anti-pattern to avoid |
|------|-----------------------------|----------------|--------------------------------------|-----------------------|-----------------------|
| #1 | User A’s list/review/generate never includes User B’s cards; generate cannot persist another account’s owner; paste is not stored | “Logged in” equals “owns the row” (inbox list has no app-level owner filter) | Identity, list vs write vs review entry, RLS vs extra owner predicate | integration | Mock away the data store; assert an internal filter copy |
| #2 | In-flight generate shows progress (status + elapsed, not a 2s gate); timeout/5xx do not freeze or claim cards were saved; 200 + empty cards is not a clean failure | Vitest `node` success means workerd success (local `npm run dev` is already workerd) | Runtime/timeout, progress contract, error translation; no live model in CI | integration (+ unit on progress visibility while generating) | Call the live model; e2e the whole generate happy path; Workers harness first |
| #3 | After a successful generate, a new list fetch for that user returns the cards (review queue is the wrong oracle) | HTTP 200 means the deck is populated | Write path, subsequent list, guest vs signed-in | integration | Happy-path insert only; oracle copied from the insert mapper |
| #4 | Mutate/review of another user’s id is denied and writes nothing | Session + id in the URL is enough | id param, ownership vs RLS, error body (no leak) | integration | Own-card happy path only |
| #5 | Guest generate/create is rejected; registered session is the owner of later cards | Seeing the dashboard means guests cannot write | Session, protected routes, generate/create APIs | integration | Full e2e signup when the API auth check is the signal |
| #6 | A recorded grade changes what is due next; a failed write does not look graded | 200 on grade means the queue moved | Persist + due query; independent expected schedule | integration | Re-implement FSRS in the test as the oracle |

## 3. Phased Rollout

Each row is a discrete rollout phase that will open its own change folder
via `/10x-new`. Status moves left-to-right through the values below; the
orchestrator updates Status as artifacts appear on disk.

| # | Phase name | Goal (one line) | Risks covered | Test types | Status | Change folder |
|---|------------|-----------------|---------------|------------|--------|---------------|
| 1 | Critical-path coverage | Bootstrap Vitest and prove isolation plus generate failure/persist contracts | #1, #2, #3 | unit + integration | researched | testing-critical-path-coverage |
| 2 | Integration around hot-spots | Prove guest/bind, IDOR deny, and grade-queue persist | #4, #5, #6 | integration | not started | — |
| 3 | Quality-gates wiring | Fail CI when the suite fails; cheap bundle/secret check | cross-cutting | gates | not started | — |

## 4. Stack

The classic test base for this project. AI-native tools (if any) carry a
`checked:` date so future readers can see which lines need re-verification.
Recommendations in this section must be grounded in local manifests/configs
plus the MCP/tools actually exposed in the current session.

Test-base profile: **none** — no runner config, 0 test files. `stryker.config.json` points at Vitest with no suite; mutation testing is premature.

| Layer | Tool | Version | Notes |
|-------|------|---------|-------|
| unit + integration | Vitest (via Astro `getViteConfig()`) | none yet — see §3 Phase 1 | Official Astro path. Astro 6 Container tests need `node` env. `getViteConfig()` needs Vitest ≥3.2 or 4.1-beta.5. Research must verify the open Astro 6 `getViteConfig()` + `vitest run` crash workaround. |
| API mocking | none yet — see §3 Phase 1 | — | Mock the model/HTTP edge only. Never mock internal services as the isolation oracle. |
| e2e | Playwright | none yet — not in this rollout | Official setup exists (`npm init playwright@latest`). Do not add CI e2e until a failure needs the full cookie+SSR shape. |
| accessibility | none | — | Not in this rollout. |
| Workers runtime harness | `@cloudflare/vitest-plugin` / pool-workers | not first layer | Official Workers docs (updated 2026-08-20) target Workers/Pages Functions, not Astro SSR as the cheapest first suite. |
| (optional) AI-native | cursor-ide-browser — checked: 2026-09-13 | n/a | Agent verification only. Do not put a vision model on landing chrome or on a contract a Vitest integration already covers. |

**Stack grounding tools (current session):**
- Docs: Context7 — Astro testing (`/withastro/docs`), Vitest config (`/vitest-dev/vitest`), Playwright intro (`/websites/playwright_dev`); checked: 2026-09-13
- Search: Exa.ai — official Astro testing page; Cloudflare Workers Vitest integration (updated 2026-08-20); checked: 2026-09-13
- Runtime/browser: cursor-ide-browser — possible agent smoke, not the first CI layer; checked: 2026-09-13
- Provider/platform: GitHub / Cloudflare / Supabase MCP — CI job, Worker logs, DB advisors after Phase 3; checked: 2026-09-13

## 5. Quality Gates

The full set of gates that must pass before a change reaches production.
"Required for §3 Phase \<N\>" means the gate is enforced once that rollout
phase lands; before that, the gate is `planned`.

| Gate | Where | Required? | Catches |
|------|-------|-----------|---------|
| lint + build | local + CI | required now | syntactic / type / compile drift (already wired) |
| unit + integration | local + CI | required after §3 Phase 3 (suite lands in Phase 1) | isolation, generate failure/persist, guest/IDOR/grade regressions |
| bundle/secret check | CI on PR | required after §3 Phase 3 | `SUPABASE_KEY` / server secrets escaping the client bundle |
| e2e on critical flows | — | not in this rollout | — |
| multimodal visual review | — | not in this rollout | — |

## 6. Cookbook Patterns

How to add new tests in this project. Each sub-section is filled in once
the relevant rollout phase ships; before that, the sub-section reads
"TBD — see §3 Phase \<N\>."

### 6.1 Adding a unit test

TBD — see §3 Phase 1 for the >2s progress-visibility rule and other cheap units that do not need a data store.

### 6.2 Adding an integration test

TBD — see §3 Phase 1 for account-isolation and generate failure/persist contracts; see §3 Phase 2 for guest/bind, IDOR deny, and grade-queue persist.

### 6.3 Adding an e2e test

Not in this rollout. Prefer integration unless research shows the failure needs the full cookie+SSR browser shape.

### 6.4 Adding a test for a new API endpoint

TBD — see §3 Phase 1–2: assert request → response *and* side-effects (list/due/mutate). Mock the model/HTTP edge only. Include an other-user id case when the route takes a resource id.

### 6.5 Adding a test for generate or review contracts

TBD — see §3 Phase 1 for generate failure/persist; see §3 Phase 2 for grade-queue persist. Do not use live model output or a re-implemented FSRS as the oracle.

### 6.6 Per-rollout-phase notes

(Optional. After each phase lands, `/10x-implement` appends a 2–3 line note here.)

## 7. What We Deliberately Don't Test

Exclusions agreed during the rollout (Phase 2 interview, Q5). Future
contributors should respect these unless the underlying assumption changes.

- **Landing / marketing chrome and static layout** — low blast radius; snapshot and visual tests would flake and catch nothing. Re-evaluate if the marketing page becomes an authenticated funnel. (Source: Phase 2 interview Q5.)
- **Typical-use prose quality of model output** — needs a labeled eval, not a unit-test oracle. Re-evaluate if a labeled set exists. (Source: challenger pass + PRD typical-use bar.)
- **shadcn/ui primitives** — the library is the test. Re-evaluate if we fork behavior.
- **Stryker / mutation score** — no suite yet; premature cost. Re-evaluate after Phase 1 has a stable isolation + generate contract.
- **Playwright in CI** — e2e is not the cheapest signal for #1–#6. Re-evaluate if research finds a failure that only appears in the full cookie+SSR browser shape.

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-09-13
- Stack versions last verified: 2026-09-13
- AI-native tool references last verified: 2026-09-13

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative-space no longer matches what the team believes.
