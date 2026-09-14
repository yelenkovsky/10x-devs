# Ground generate in paste — Plan Brief

> Full plan: `context/changes/ground-generate-in-paste/plan.md`
> Frame brief: `context/changes/ground-generate-in-paste/frame.md`

## What & Why

> **The actual problem to plan around is**: A successful generate can persist a 15-card model batch that is not grounded in the pasted targets, and the UI reports that as “Using the first 15 items from this paste.”

There is no second “paste fallback” path. The banner is the cap note on the only generate path, keyed off model envelope length.

## Starting Point

`generateCards` sends the raw paste, accepts any zod-valid card, and sets `truncated` when the model returns ≥15 cards. The island always says the first 15 items are used. Tests do not assert grounding or `truncated`.

## Desired End State

A short paste persists only cards whose `wordPhrase` occurs in that paste. The “first 15 items” note appears only when a list was actually cut. A generate that matches nothing stays HTTP 200 and explains that none of the cards matched the paste.

## Key Decisions Made

| Decision            | Choice                                                                 | Why (1 sentence)                                                                 | Source   |
| ------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------- | -------- |
| Grounding match     | Case-insensitive occurrence after punctuation normalize                | One rule for lists and prose; no stemmer                                         | Plan     |
| Truncation banner   | Input was cut (list item count > 15); **supersedes** S-01 exactly-15-envelope `truncated` | The framed lie is envelope-length `truncated`; `CARD_CAP` stays 15 | Frame / Plan |
| Ungrounded cards    | Drop; count in `failedCount`; persist the rest                         | Keep good cards; do not store junk                                               | Plan     |
| Zero grounded cards | HTTP 200 + unmatched status; not 503                                   | Keep empty-200; do not look like a down provider or an empty first visit         | Plan     |
| List vs prose       | Newline/`/`/bullets; commas only without `.?!`; space-only stays prose | Makes “input cut” a real count without chopping sentences                        | Plan     |
| Schema bounds       | `maxItems` 15; list N≤15 also `minItems = N`; app filter still wins    | Prompt-only cannot stop padding; some routes may 400 on `minItems`               | Plan     |
| Inbox on generate   | Unchanged prepend                                                      | Deck was already empty; not this bug                                             | Frame    |

## Scope

**In scope:** paste shaping, schema cap, persist filter, `truncated` from input, dashboard helper/banner/unmatched copy, Vitest with mocked OpenRouter.

**Out of scope:** fallback removal, inbox replace, stemming, model retry, storing paste, 503 on empty grounded, CI test job, live model in CI.

## Architecture / Approach

Before OpenRouter, split list vs prose and cap lists at 15. That haystack is the user message and the grounding string. After the model returns, persist zod-valid cards whose `wordPhrase` occurs in the haystack. `truncated` means the list had more than 15 items. The island trusts that flag and treats `200` + 0 cards + `failedCount > 0` as unmatched paste.

## Phases at a Glance

| Phase                  | What it delivers                                      | Key risk                                      |
| ---------------------- | ----------------------------------------------------- | --------------------------------------------- |
| 1. Generate contract   | Shaped paste, schema bounds, persist filter, tests    | Comma/prose mis-split; `minItems` 400 from a route |
| 2. Dashboard copy      | Honest helper, banner, unmatched-paste status         | Empty-deck copy still winning over the status |

**Prerequisites:** Working dashboard generate + learner OpenRouter key for manual checks; Vitest already in repo.
**Estimated effort:** ~1–2 sessions across 2 phases.

## Open Risks & Assumptions

- `minItems` may 400 on some OpenRouter routes; default `gpt-4o-mini` is assumed to accept it; fail closed, no retry-without-keyword.
- `apple` matching inside `pineapple` is accepted.
- Space-separated lists are prose; substring grounding still allows those words.
- Pre-existing ungrounded rows are not cleaned up.
- S-07 forbids changing paste caps and the typical-use prompt: this change keeps cap 15 and the typical-use bar; it only changes when `truncated` is true and adds a grounding instruction.

## Success Criteria (Summary)

- Short paste → cards that appear in the paste; no “first 15 items from this paste.”
- 20-item list → at most 15 cards and that banner.
- All-ungrounded batch → nothing persisted, unmatched status, not a 503.
