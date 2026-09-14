# Ground generate in paste Implementation Plan

## Overview

A successful generate can persist a 15-card OpenRouter batch that is not grounded in the pasted targets, and the UI reports that as “Using the first 15 items from this paste.” This change binds persist and that note to the paste: only cards whose `wordPhrase` occurs in the (possibly capped) input are saved, and the “first 15” line appears only when a list was actually cut.

## Current State Analysis

Frame brief (`frame.md`) settled the problem. There is no paste-fallback builder. One path: `POST /api/cards/generate` → `generateCards` → OpenRouter. The dashboard was empty before the observed generate, so inbox prepend did not fill the list.

Today `truncated` is `envelope.data.cards.length >= CARD_CAP` (`src/lib/services/generate-cards.ts`). `CARD_CAP` is 15. The JSON schema has no `minItems`/`maxItems`. The user message is the raw paste. Every zod-valid card is inserted. Paste items are never counted. `PasteGenerate` always shows “The first 15 items are used.” and shows the truncation banner whenever `batchNotes.truncated` is true.

S-01 required exactly-15 → `truncated: true` (`context/changes/paste-generate-typical-use/plan.md` Phase 2). That contract is what labels a padded short paste as a cut list. **This plan supersedes that predicate:** `truncated` means the **input list** had more than 15 items. `CARD_CAP` stays 15. S-07’s “do not change paste caps or the typical-use prompt” still holds for the cap number and the typical-use bar; it does not freeze envelope-length `truncated` or forbid a one-per-line / extract-from-this-text instruction.

Tests never assert `truncated` or paste grounding (`src/lib/services/generate-cards.test.ts`). Coverage Phase 5 left cap/truncate out of scope — those cases belong here, not as a conflict with that suite. HTTP `200` + `cards: []` stays a legal empty-success shape (`context/changes/testing-critical-path-coverage/plan.md`); this change does not turn that into a 503.

## Desired End State

From a signed-in `/dashboard`, a 3-item list generate persists only cards whose `wordPhrase` occurs in that paste (case-insensitive, punctuation-normalized). A model envelope of 15 ungrounded cards does not fill the deck. “Using the first 15 items from this paste.” appears only when the paste was a list with more than 15 items. Prose is not split and never uses that line, even if 15 grounded cards persist. If a model batch yields zero grounded cards, the response is still 200 with no insert, and the island explains that none of the cards matched the paste — not the generic empty-deck line and not a 503. Lint, build, and `npm test` stay green. No live model in CI.

### Key Discoveries:

- `truncated` is keyed off model envelope length, not paste items (`src/lib/services/generate-cards.ts` `CARD_CAP`, persist loop, return).
- Helper copy claims a cut list on every paste (`src/components/cards/PasteGenerate.tsx`).
- `failedCount` is already shown as “N cards from this batch could not be saved.” Ungrounded drops reuse that field; a 0-card batch needs distinct unmatched copy so it does not look like “No cards yet.”
- OpenAI structured outputs (the `gpt-4o-mini` path) allow array `minItems`/`maxItems`; OpenRouter does not document those keywords and some routes may 400. App-side grounding remains the source of truth.
- Generate tests already mock OpenRouter URL-prefix only via `createUserOpenRouterKeyStore` (`src/test/user-openrouter-key-store.ts`). Grounding/truncated cases belong there plus a pure helper test file — not a live model, not Playwright.

## What We're NOT Doing

- Removing a paste fallback (it does not exist).
- Replacing the dashboard inbox on generate (leftovers were not this bug).
- Lemma/stemming (`apple` → `apples`) or blocking `apple` inside `pineapple` (accepted substring tradeoff).
- Retrying OpenRouter on an ungrounded batch.
- Storing the raw paste, changing `CARD_CAP`, or changing the six card fields.
- Turning 0 grounded cards into 503 / `generation_unavailable`.
- Deduping against existing cards.
- A typical-use eval set or a rewrite of the typical-use quality bar (context, collocation, pattern — not C1/C2). Prompt edits are limited to one-card-per-listed-line / extract only from this text.
- Wiring `npm test` into GitHub Actions (still test-rollout Phase 3).
- Parsing space-separated word lists as items (`apple banana cherry` stays prose; substring grounding still allows those targets).

## Implementation Approach

Keep the single generate path and the existing `GenerateCardsResponse` (`cards`, `failedCount`, `truncated`, `cap`). Do not keep S-01’s exactly-15-envelope `truncated` rule. Add a pure paste-shaping helper used **before** OpenRouter: list vs prose, cap at 15, `truncated` from input count. Send the capped list (or full prose) as the user message. Tighten JSON schema `maxItems` (and `minItems` for a known list length). After the model returns, zod-parse each card, drop ungrounded `wordPhrase`s into `failedCount`, persist the rest. Phase 2 only changes island copy: honest helper line, banner still bound to `truncated`, unmatched-paste status on 0-card 200 with `failedCount > 0`.

## Critical Implementation Details

### Timing & lifecycle

Shape the paste **before** `fetch` so the user message and `minItems`/`maxItems` match the targets. Do not count items from the model envelope. Persist still runs only after OpenRouter succeeds; insert nothing when the grounded set is empty.

### User experience spec

On `200` with `cards.length === 0` and `failedCount > 0`, show unmatched-paste status and do **not** also show the generic “N could not be saved” line (redundant) or the “No cards yet” empty-deck line as the explanation of this generate. Empty envelope (`failedCount === 0`) stays the locked silent empty-200. Truncation banner copy stays “Using the first {cap} items from this paste.” — only the flag’s meaning changes.

---

## Phase 1: Generate contract

### Overview

Bind OpenRouter input, schema bounds, persist, and `truncated` to the paste. After this phase a short list cannot persist 15 ungrounded cards and cannot return `truncated: true`.

### Changes Required:

#### 1. Paste shaping and grounding helper

**File**: `src/lib/services/paste-targets.ts` (new)

**Intent**: Decide list vs prose, cap list items, and test whether a `wordPhrase` occurs in the text we will send to the model — in one place `generateCards` and tests can share.

**Contract**: Export `CARD_CAP` from `generate-cards.ts` (keep the existing export) or re-export a single cap constant so both modules agree on 15. Parse a already-trimmed paste:

- Split on newlines, `/`, and bullet prefixes (`-`, `*`, `•`).
- Split on commas **only when the original paste has no `.?!`** (comma-rich prose stays one chunk).
- Drop empty segments. If fewer than 2 items remain, treat as **prose**: one target blob = the original paste, `truncated: false`.
- If 2+ items: **list**. `truncated` iff `items.length > CARD_CAP`. User-message haystack = first 15 items, one per line, paste order.
- `isGrounded(wordPhrase, haystack)`: case-fold, trim, turn punctuation into spaces, collapse whitespace, then `haystack.includes(wordPhrase)` with both sides normalized. Empty needle → not grounded.

#### 2. OpenRouter body and persist filter

**File**: `src/lib/services/generate-cards.ts`

**Intent**: Send only the shaped paste, constrain array length in schema, persist grounded zod-valid cards, set `truncated` from the helper (input cut), fold ungrounded cards into `failedCount`.

**Contract**:

- Call the helper before `requestOpenRouterCards`. User message is the haystack (capped list or full prose), not necessarily the raw 20-item string.
- Prompt: one card per listed line in order; for prose, extract only targets that appear in this text; at most 15; no extra cards.
- JSON schema: `cards.maxItems = 15`. For a list of N where `1 ≤ N ≤ 15`, also `cards.minItems = cards.maxItems = N`. Prose: `maxItems` only (no `minItems`). Keep `strict: true`, `additionalProperties: false`, `provider.require_parameters: true`.
- After parse: still slice envelope to `CARD_CAP`. For each candidate: zod fail or ungrounded → `failedCount += 1`. Persist only grounded valid cards. `truncated` is the helper’s input-cut flag, **not** `envelope.length >= 15`.
- Empty grounded set → existing `persistValidCards` `[]` path, HTTP 200, `failedCount` reflecting drops.

If a configured model/route 400s on `minItems`, fail closed with existing `generation_unavailable` (do not silently omit the keyword on retry). Default `openai/gpt-4o-mini` supports those keywords.

#### 3. Service tests

**Files**: `src/lib/services/paste-targets.test.ts` (new), `src/lib/services/generate-cards.test.ts`

**Intent**: Lock list/prose/cap/match without a live model, then lock persist/`truncated` on the existing OpenRouter `fetch` stub.

**Contract**: Helper tests (no network): slash/newline/bullet lists; comma list without `.?!`; sentence with commas stays prose; space-only `apple banana cherry` stays prose; 20 items → truncated + 15-line haystack; `Apple` grounded in `apple / banana`; `fruit` not grounded; `apples` not grounded in `apple`. `generateCards` tests (reuse key store + URL-prefix `fetch` mock): 3-item paste + 15-card envelope with 3 grounded → persist 3, `truncated: false`, `failedCount` 12; short paste + 15 ungrounded → persist 0, `truncated: false`, `failedCount` 15; 20-item list → OpenRouter user message is first 15 lines, `truncated: true`. Do not call OpenRouter for real. Do not use review as persist oracle.

### Success Criteria:

#### Automated Verification:

- `src/lib/services/paste-targets.test.ts` covers list vs prose, cap, truncated, and grounding cases above
- `generate-cards` tests persist only grounded cards and set `truncated` from input cut, including the 3-item + 15-envelope case
- `npm test` exits 0
- `npm run lint` succeeds
- `npx astro sync` succeeds
- `npm run build` succeeds

#### Manual Verification:

- Local signed-in generate of a 3-word slash list (live key) yields cards whose `wordPhrase`s appear in the paste — not 15 unrelated targets

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Dashboard copy

### Overview

Make the island tell the truth about the cap and about a generate that saved nothing. Persist behavior is already correct from Phase 1.

### Changes Required:

#### 1. Helper and truncation banner

**File**: `src/components/cards/PasteGenerate.tsx`

**Intent**: Stop claiming every paste is a 15-item cut. Keep the truncation banner for a real list cut (`truncated` from the API).

**Contract**: Replace the always-on “The first 15 items are used.” with a line that does not imply a cut (character count may stay). Leave the existing `batchNotes.truncated` banner copy as “Using the first {cap} items from this paste.” Do not derive truncated in the island.

#### 2. Unmatched-paste status

**File**: `src/components/cards/PasteGenerate.tsx`

**Intent**: A 200 that persisted 0 cards because the batch was ungrounded (or all zod-invalid) must not look like a first visit.

**Contract**: After a successful parse, if `cards.length === 0` and `failedCount > 0`, show a `role="status"` unmatched-paste line (none of the cards matched this paste). Do not show the generic failedCount line in that same case. Do not show the “No cards yet…” empty-deck copy as the explanation of this generate (empty-deck remains for no cards and no current batch note). `failedCount === 0` + empty cards (empty envelope) stays silent empty-200. No new response fields.

#### 3. Island tests

**File**: `src/components/cards/PasteGenerate.test.tsx`

**Intent**: Lock banner and unmatched copy without hitting OpenRouter.

**Contract**: Mock `/api/cards/generate` only. `truncated: false` → no “Using the first 15 items from this paste.” `truncated: true` → that banner. `200` + `cards: []` + `failedCount > 0` → unmatched status, not empty-deck copy, not `role="alert"` 503. Helper text must not always say “The first 15 items are used.”

### Success Criteria:

#### Automated Verification:

- PasteGenerate tests cover truncation banner on/off and unmatched-paste 200
- Helper copy no longer always claims the first 15 items are used
- `npm test` exits 0
- `npm run lint` succeeds
- `npx astro sync` succeeds
- `npm run build` succeeds

#### Manual Verification:

- Short list generate: no “Using the first 15 items from this paste.”
- 20-item slash/newline list: that banner appears; cards correspond to the first 15 items
- If a generate saves 0 cards: unmatched-paste status, not only “No cards yet”

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful.

---

## Testing Strategy

### Unit Tests:

- `paste-targets` — delimiters, comma-vs-prose guard, cap, truncated, case-fold grounding, `fruit` / `apples` negatives
- `generateCards` — mocked OpenRouter envelope: mixed grounded, all ungrounded, 20-item list user message
- `PasteGenerate` — banner flag, unmatched 200, helper copy

### Integration Tests:

- None required beyond existing generate `fetch` stubs. Do not add Playwright or a live-model CI job. Two-user RLS remains the other change’s suite.

### Manual Testing Steps:

1. Sign in with an OpenRouter key. Empty dashboard optional.
2. Paste `apple / banana / run` → cards’ word/phrases are those words (or case variants), not 15 random targets; no first-15 banner.
3. Paste a short paragraph that uses `brew` → at least one card with `brew` (or that spelling in the paste); no first-15 banner.
4. Paste 20 newline-separated words → at most 15 cards and the first-15 banner.
5. Typical-use spot-check still holds (context, collocation, pattern — not C1 showpieces). Out of scope to automate.

## Performance Considerations

Same one OpenRouter `fetch` + one insert. Parsing a 4000-character paste is cheap vs the model call. List `minItems` does not add a round trip. Do not retry the model.

## Migration Notes

No schema change. No paste backfill. Existing `generated` rows that were ungrounded stay until the learner deletes them (S-03). Rollback is revert of this change; `truncated` would again follow envelope length.

## References

- Frame: `context/changes/ground-generate-in-paste/frame.md`
- Prior generate contract (exactly-15 → `truncated` **superseded here**): `context/changes/paste-generate-typical-use/plan.md` Phase 2/3
- S-07: keep `CARD_CAP` and typical-use bar; `context/changes/user-openrouter-key/plan.md` What We’re NOT Doing
- Empty-200 lock; cap/truncate tests were out of scope there: `context/changes/testing-critical-path-coverage/plan.md` Phase 5
- `src/lib/services/generate-cards.ts`
- `src/components/cards/PasteGenerate.tsx`
- `src/pages/api/cards/generate.ts`
- OpenRouter structured outputs: https://openrouter.ai/docs/guides/features/structured-outputs
- OpenAI structured outputs array `minItems`/`maxItems`: https://platform.openai.com/docs/guides/structured-outputs

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Generate contract

#### Automated

- [x] 1.1 `src/lib/services/paste-targets.test.ts` covers list vs prose, cap, truncated, and grounding cases above
- [x] 1.2 `generate-cards` tests persist only grounded cards and set `truncated` from input cut, including the 3-item + 15-envelope case
- [x] 1.3 `npm test` exits 0
- [x] 1.4 `npm run lint` succeeds
- [x] 1.5 `npx astro sync` succeeds
- [x] 1.6 `npm run build` succeeds

#### Manual

- [x] 1.7 Local signed-in generate of a 3-word slash list (live key) yields cards whose `wordPhrase`s appear in the paste — not 15 unrelated targets

### Phase 2: Dashboard copy

#### Automated

- [ ] 2.1 PasteGenerate tests cover truncation banner on/off and unmatched-paste 200
- [ ] 2.2 Helper copy no longer always claims the first 15 items are used
- [ ] 2.3 `npm test` exits 0
- [ ] 2.4 `npm run lint` succeeds
- [ ] 2.5 `npx astro sync` succeeds
- [ ] 2.6 `npm run build` succeeds

#### Manual

- [ ] 2.7 Short list generate: no “Using the first 15 items from this paste.”
- [ ] 2.8 20-item slash/newline list: that banner appears; cards correspond to the first 15 items
- [ ] 2.9 If a generate saves 0 cards: unmatched-paste status, not only “No cards yet”
