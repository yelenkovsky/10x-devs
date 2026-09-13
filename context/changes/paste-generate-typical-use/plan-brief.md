# Paste and generate typical-use cloze cards — Plan Brief

> Full plan: `context/changes/paste-generate-typical-use/plan.md`
> Roadmap: `context/foundation/roadmap.md` (S-01)

## What & Why

A self-learner stalls after meeting new words because turning a list or short text into typical-use cloze cards takes too long. This slice is the proving story: paste, live AI generate, cards that stay on their account (US-01, FR-002, FR-003, FR-004, FR-009). Quality means context, collocation, and grammar pattern — not C1/C2 showpieces.

## Starting Point

Cookie auth and a guarded `/dashboard` exist (S-02). There is no card table, no generate API, and no paste UI. `requireUser` is the JSON write contract; middleware already says deck routes join `PROTECTED_ROUTES` and writes call that helper.

## Desired End State

Signed in on `/dashboard`, they paste a word list or short paragraph, watch a progress panel, and get cloze cards (gap, word/phrase, full sentence, definition, collocation/pattern, Polish). Refresh still shows them. Empty paste explains itself. Another account sees nothing.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Persist vs S-03 gate | Save immediately as `generated`, not `kept` | Refresh must keep cards; S-03 flips kept / deletes | Plan |
| List vs prose | One generate path; model handles both | PRD kept both as one job | Plan |
| How many cards | One per item, cap 15, “first 15” note | Protects Workers time and the typical-use bar | Plan |
| Empty / too big | Trimmed-empty empty-state; 4000-char error; `"."` still generates | Matches AC without silently truncating | Plan |
| Duplicates | Accumulate; no dedup | S-03 can delete; simplest isolation story | Plan |
| Typical-use check | Prompt + required fields; human spot-check 2 pastes | No labeled eval (roadmap unknown, not blocking) | Roadmap / Plan |
| Progress | Client panel (status + elapsed) on one request | NFR without DO/streaming | Plan |
| Partial model output | Save valid cards; report `failedCount` | Don’t throw away a good batch | Plan |
| Provider | OpenRouter `fetch`, default `openai/gpt-4o-mini` | Structured outputs, workerd-safe, swap via env | Plan |
| Surface | Replace `/dashboard` | First session already lands there | Plan |
| Raw paste | Not stored | Smallest leak surface | Plan |
| Verification | Lint + build + manual; no test runner | Same bar as S-02; keep schema and progress panel | Plan |

## Scope

**In scope:** `flashcards` + RLS; OpenRouter generate API; dashboard paste, progress, card list; empty/over-size/isolation.

**Out of scope:** accept/edit/delete UI; browse chrome; manual create; SRS; paste history; streaming; test runner; 75% accept-rate optimization.

## Architecture / Approach

Browser `fetch`es `POST /api/cards/generate` (cookie session, `requireUser`). Handler zod-checks paste, service calls OpenRouter `json_schema`, inserts valid rows as `generated` with a `generation_id` (not the paste). Dashboard SSR-loads the user’s cards newest-first; a React island owns paste and the in-flight progress panel.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Card schema and isolation | `flashcards` + RLS + `src/types.ts` | Policies too loose or UPDATE-without-SELECT for S-03 |
| 2. Generate API | OpenRouter + persist + empty/cap/partial | Workers Free 10 ms CPU (Error 1102) on hosted |
| 3. Dashboard paste and results | Progress panel + list + spot-check | Typical-use bar only as good as prompt + review |

**Prerequisites:** Local Supabase + gitignored `.dev.vars` (`SUPABASE_*`, `OPENROUTER_API_KEY`). Hosted needs the migration and `wrangler secret put OPENROUTER_API_KEY`.
**Estimated effort:** ~2–3 sessions across 3 phases.

## Open Risks & Assumptions

- Hosted Worker is still on the Free CPU cap; first live generate may force Workers Paid.
- Typical-use is prompt + human spot-check, not an eval set.
- `generated` cards are visible before S-03; review (S-04) must not treat them as kept.
- OpenRouter cost/rate limits are out of band; missing key is a banner + 503.

## Success Criteria (Summary)

- Paste list or short text → typical-use cloze cards with all six fields, still there after refresh.
- Empty / over-size fail out loud; another account never sees the cards or the paste.
- Generate longer than two seconds shows a live progress panel, not a frozen screen.
