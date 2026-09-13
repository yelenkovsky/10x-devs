# Frame Brief: Ground generate in paste

> Framing step before /10x-plan. This document captures what is *actually*
> at issue, separated from what was initially assumed.

## Reported Observation

After generate, on the same screen, the line “Using the first 15 items from this paste.” appears and the list fills with cards that are not the ones just generated.

## Initial Framing (preserved)

- **User's stated cause or approach**: A paste fallback is taking the first 15 items and filling the list with random cards instead of the generated batch.
- **User's proposed direction**: The screen should show only the flashcards generated from that paste.
- **Pre-dispatch narrowing**: Both the paste line and the wrong cards, together, immediately after the first successful generate.

## Dimension Map

The observation could originate at any of these dimensions:

1. **Paste fallback path** — a second path synthesizes cards from the first 15 paste items instead of the model batch  ← initial framing
2. **Truncation-note semantics** — the line is a cap note (`truncated` when the model returns ≥15 cards), not a fallback
3. **Model/schema card count** — the request does not pin “one card per paste item,” so a generate can return 15 loosely related cards and trip the cap note
4. **Dashboard list accumulation** — generate prepends onto the SSR inbox, so leftover cards sit next to the new batch
5. **Production-only generate path** — hosted Worker / env / model / body parsing drops or ignores the paste while still returning a 15-card 200

## Hypothesis Investigation

| Hypothesis | Evidence | Verdict |
| --- | --- | --- |
| Paste fallback synthesizes cards from the first 15 paste items | Single path only: `POST /api/cards/generate` → `generateCards` → OpenRouter. No paste split, mock, seed, or catch that still 200s with paste-derived rows (`src/pages/api/cards/generate.ts:46–53`; `src/lib/services/generate-cards.ts:108–134` on `origin/main`). Missing key throws; it does not invent cards. | NONE |
| Banner is `truncated`, not a fallback | Copy is only `batchNotes?.truncated` (`src/components/cards/PasteGenerate.tsx:233–236`). `truncated = envelope.data.cards.length >= CARD_CAP` (`generate-cards.ts:119–120`, `CARD_CAP = 15` at line 8). Paste items are never counted. Plan required exactly-15 → `truncated: true` (`context/changes/paste-generate-typical-use/plan.md` Phase 2 contract). Tests never set or assert `truncated`. | STRONG (banner) / NONE (card swap) |
| Model/schema can persist 15 ungrounded cards | `cardJsonSchema.cards` has no `minItems`/`maxItems` (`generate-cards.ts:43–83`). User message is the raw paste only (`generate-cards.ts:153–155`). Persist slices the **model** array, then inserts every valid candidate (`generate-cards.ts:119–133`). Prompt says one-per-item and “at most 15”; that is not enforced. No paste-item vs returned-card check in `src/`. | STRONG |
| SSR leftovers mix the list | Prepend is real and intended (`PasteGenerate.tsx:114`; plan: “second generate prepends”). Dashboard SSR is the full inbox (`dashboard.astro:10–30`; `list-flashcards.ts:38–43`). User then reported the deck showed “No cards yet” before Generate — leftovers cannot fill an empty `initialCards`. | NONE (for this observation) |
| Production path drops the paste | Independent search and prod-vs-local both: hosted Worker parses `{ paste }`, rejects empty, and sends that string as the OpenRouter user message. No hosted stub, timeout persist, or DEV mock of 15 cards. Free-plan CPU / missing key fail closed (503 / 1102), they do not invent cards. Local `npm run dev` is already workerd. What can differ is secret *values* and `HTTP-Referer` origin (attribution header only). Current `main` generate uses the learner’s saved key; the observed 15-card 200 was the live Worker’s operator-key build — same persist/`truncated` contract either way. | NONE (drop/stub) |

## Narrowing Signals

Decisive observations from Step 4 (user reports + sub-agent findings) that
narrowed the hypothesis space:

- Both the banner and the wrong cards appear together on the same screen after a successful generate.
- The dashboard was empty (“No cards yet”) immediately before Generate — rules out leftover-inbox prepend as the filler.
- Every generate produces 15 cards; every target word is unrelated to the paste (“every single one was random”).
- The user sees this only in production (hosted generate), not as a local paste-parser fallback.
- Pressure-test (no named cause): the only mechanism that yields “200 + that exact line + 15 unrelated targets” on an empty dashboard is `generateCards` treating a ≥15-card model envelope as a truncated paste and persisting every valid card. A hosted-only drop of the paste is absent.

## Cross-System Convention

A generate-from-paste flow usually binds **output count (and targets) to the pasted items**, and only announces “first N of this paste” when the **input** was actually cut. This codebase keys `truncated` off **model envelope length ≥ 15** and has no paste-vs-cards comparison, so a 15-card model reply is labeled as a truncated paste even when the paste was short. That matches the observed banner and does not require a fallback.

## Reframed (or Confirmed) Problem Statement

> **The actual problem to plan around is**: A successful generate can persist a 15-card model batch that is not grounded in the pasted targets, and the UI reports that as “Using the first 15 items from this paste.”

The initial framing was wrong: there is no second path that builds cards from the first 15 paste items. The banner is the intended cap note on the only generate path. Leftover dashboard cards are not what filled the list (empty deck). What remains is the generate contract: unconstrained schema + `truncated` from returned count + persist-all-valid, so an ungrounded 15-card OpenRouter envelope is saved and labeled as a truncated paste. That is in `generateCards` and `PasteGenerate`; it does not depend on a captured production payload.

## Confidence

- **HIGH** — strong evidence + matches convention + decisive narrowing signal

The contract is readable in-repo (`truncated = envelope.data.cards.length >= CARD_CAP`; no paste-item count; no `wordPhrase`-in-paste check). Alternatives (fallback builder, leftover inbox, hosted paste drop) were absent. The production-only report is where the live model was called, not a second unknown cause.

## What Changes for /10x-plan

The plan should be about **grounding generate in the paste** — the persisted batch and the “first 15” note must reflect the pasted targets, not an unconstrained 15-card model envelope. Do not plan “remove a paste fallback” (it does not exist). Do not plan “replace the inbox on generate” as the fix for this observation (the deck was already empty).

## References

- Source files: `src/components/cards/PasteGenerate.tsx:114,163–165,233–236`; `src/lib/services/generate-cards.ts:8,25,43–83,108–155` (`origin/main`); `src/pages/api/cards/generate.ts:38–53`; `src/pages/dashboard.astro:10–30`; `context/changes/paste-generate-typical-use/plan.md` Phase 2/3 truncation contract
- Related research: none for this change
- Investigation tasks: `1b0da09b-6f47-427b-a81c-23e777fdec19` (fallback), `aad71c9c-a83b-4184-8674-33da16b869d4` (truncated banner), `667769fc-33ca-435b-96e6-df4f349342db` (model 15-card pad), `3b6dbd51-eb45-49c9-b7df-9a7d89633117` (inbox accumulate), `879bcb99-96d1-4756-b278-c33516955354` (prod vs local), `16632d2f-3ceb-4f56-8226-cb79a6c6c6f7` (independent search)
