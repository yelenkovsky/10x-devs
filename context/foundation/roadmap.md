---
project: 10xUsage
version: 1
status: draft
created: 2026-09-13
updated: 2026-09-14
prd_version: 1
main_goal: speed
top_blocker: time
milestone_id: first-session-from-paste
milestone_seq: 1
milestone_status: done
---

# Roadmap: 10xUsage

> Derived from `context/foundation/prd.md` (v1) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Milestone

**M-1: First session from paste** — Status: done

- **Intent:** A self-learner can finish the first session: register and sign in, add their OpenRouter API key, paste a word list or short text, receive typical-use cloze cards, accept/edit/delete them (or create one by hand), and review with a ready-made spaced-repetition algorithm.
- **Source materials:** `context/foundation/prd.md` (v1)
- **Done when:** every S-NN below is `done`.
- **Scope anchors:** US-01, US-02, FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-007, FR-008, FR-009, FR-010, plus S-07 (user OpenRouter key; not in PRD v1).



## Vision recap

Adult self-learners who already use spaced repetition stall right after meeting new words: turning a word list or short text into flashcards that teach typical use (context, collocation, grammar pattern) takes long enough that they skip the cards. Quality here means typical use, not impressive C1/C2 sentences. 10xUsage exists to convert text the learner already has into those cards so the spaced-repetition habit holds.

## North star

The north star — the smallest end-to-end slice whose successful delivery would prove the product idea, placed as early as Prerequisites allow because everything else only matters if this works — is **S-01: User can paste a word list or short text and get typical-use cloze cards on their account**. Live generation is the product (FR-003), auth is already in the baseline, and the sequencing goal is speed.

## At a glance


| ID   | Change ID                  | Outcome (user can …)                                                             | Prerequisites | PRD refs                              | Status      |
| ---- | -------------------------- | -------------------------------------------------------------------------------- | ------------- | ------------------------------------- | ----------- |
| S-01 | paste-generate-typical-use | paste a word list or short text and get typical-use cloze cards on their account | —             | US-01, FR-002, FR-003, FR-004, FR-009 | done |
| S-02 | email-password-account     | create an account with email and password and sign in                            | —             | US-02, FR-001, FR-010                 | done |
| S-03 | gate-generated-cards       | accept, edit, or delete a generated flashcard                                    | S-01          | US-01, FR-005                         | done |
| S-04 | srs-review-session         | review their flashcards with a ready-made spaced-repetition algorithm            | S-03          | US-01, FR-008                         | done |
| S-05 | manual-card-create         | create a flashcard by hand with the same fields as generated cards               | S-01          | US-01, FR-006                         | done |
| S-06 | browse-flashcards          | browse their flashcards                                                          | S-01          | FR-007                                | done |
| S-07 | user-openrouter-key        | add their OpenRouter API key and generate with that key                          | S-02          | — (new; not in PRD v1)                | done |




## Streams

Navigation aid — groups items that share a Prerequisites chain. Canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks.


| Stream | Theme           | Chain                    | Note                                                                                               |
| ------ | --------------- | ------------------------ | -------------------------------------------------------------------------------------------------- |
| A      | First session   | `S-01` → `S-03` → `S-04` | Speed path: generate, then gate, then review. After S-07, generate needs the learner’s key.        |
| B      | Account         | `S-02` → `S-07`          | Sign-in, then BYOK. S-07 changes S-01 generate to user-key-only.                                   |
| C      | Card collection | `S-05` → `S-06`          | Joins Stream A at `S-01`. Sequenced after the first session for speed; both depend only on `S-01`. |




## Baseline

What's already in place in the codebase as of `2026-09-13` (auto-researched + user-confirmed).
Foundations below assume these are present and do NOT re-scaffold them.

- **Frontend:** present — Astro 6 SSR + React 19 islands, Tailwind 4, shadcn/ui (`package.json`, `src/pages/`)
- **Backend / API:** partial — SSR + three auth API routes; no card or generation handlers (`src/pages/api/auth/`*)
- **Data:** partial — Supabase client wired; no card schema or migrations (`src/lib/supabase.ts`; `supabase/migrations/` absent)
- **Auth:** present — email+password sign-up/sign-in, cookie sessions, `/dashboard` guard (`src/middleware.ts`)
- **Deploy / infra:** present — Cloudflare Workers + GitHub Actions lint/build/deploy (`wrangler.jsonc`, `.github/workflows/ci.yml`)
- **Observability:** partial — Workers observability flag on; no app logging or error tracking (`wrangler.jsonc`)



## Foundations

None. Frontend, auth, and deploy are present in the baseline and are not re-scaffolded. Card persistence, per-account isolation, generation, and visible progress during slow generation land inside `S-01` (the first slice that needs them). Application-level observability is not a prerequisite for planning `S-01`; the progress NFR is user-visible feedback in that slice, not an operations stack.

## Slices



### S-01: Paste and generate typical-use cloze cards

- **Outcome:** user can paste a word list or short text and receive typical-use cloze cards (gapped sentence, word/phrase, full sentence, short definition, collocation/pattern, Polish translation) that stay on their account; empty paste shows an explanatory empty-state, not a silent failure.
- **Change ID:** paste-generate-typical-use
- **PRD refs:** US-01, FR-002, FR-003, FR-004, FR-009
- **Prerequisites:** —
- **Parallel with:** S-02, S-07
- **Blockers:** —
- **Unknowns:**
  - How to check the typical-use bar (context, collocation, grammar pattern — not C1/C2 showpieces) on generated cards without a labeled eval set — Owner: user. Block: no.
- **Risk:** This is the first proving story and the slowest new integration (live generation plus first card persistence and isolation). Generation may take more than two seconds; this slice must show continuous progress and must not leak pastes or cards across accounts. Relies on existing signed-in sessions from the baseline.
- **Status:** done



### S-02: Create an account and sign in

- **Outcome:** user can create an account with email and password and sign in so later flashcards bind to that account; unauthenticated visitors cannot keep a saved deck.
- **Change ID:** email-password-account
- **PRD refs:** US-02, FR-001, FR-010
- **Prerequisites:** —
- **Parallel with:** S-01, S-03, S-04, S-05, S-06, S-07
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Auth is already present in the baseline; this slice exists so US-02 stays on the roadmap and any remaining gaps (unauthenticated visitors keeping a deck) get closed. It is not a reason to defer S-01.
- **Status:** done



### S-03: Accept, edit, or delete generated cards

- **Outcome:** user can accept, edit, or delete a generated flashcard before it is treated as kept for study.
- **Change ID:** gate-generated-cards
- **PRD refs:** US-01, FR-005
- **Prerequisites:** S-01
- **Parallel with:** S-02, S-05, S-06, S-07
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Without this gate, generated cards land in the deck unreviewed and the first session skips a required step. Sequenced immediately after S-01 so review (S-04) can use kept cards, not raw model output.
- **Status:** done



### S-04: Review cards with a ready-made SRS

- **Outcome:** user can review their flashcards with a ready-made spaced-repetition algorithm.
- **Change ID:** srs-review-session
- **PRD refs:** US-01, FR-008
- **Prerequisites:** S-03
- **Parallel with:** S-02, S-05, S-06, S-07
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Closes the first session. Custom scheduling is a Non-Goal; this slice only wires a ready-made algorithm onto kept cards. Sequenced before browse/manual-create so the Success Criteria session is complete before collection extras.
- **Status:** done



### S-05: Create a flashcard by hand

- **Outcome:** user can create a flashcard by hand with the same fields as generated cards, under the same typical-use bar.
- **Change ID:** manual-card-create
- **PRD refs:** US-01, FR-006
- **Prerequisites:** S-01
- **Parallel with:** S-02, S-03, S-04, S-06, S-07
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Required, but not on the paste-generate-review path. Sequenced after the first session because the goal is speed; it still depends only on the card shape from S-01.
- **Status:** done



### S-06: Browse flashcards

- **Outcome:** user can browse their flashcards.
- **Change ID:** browse-flashcards
- **PRD refs:** FR-007
- **Prerequisites:** S-01
- **Parallel with:** S-02, S-03, S-04, S-05, S-07
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Required, but the first session is a review queue, not a card catalog. Sequenced last so speed does not spend the first proving story on a browse-all surface.
- **Status:** done



### S-07: Add an OpenRouter API key

- **Outcome:** user can add, replace, or remove their OpenRouter API key on their account; generate uses that key only (no operator env fallback); another account never sees the hint or uses the key.
- **Change ID:** user-openrouter-key
- **PRD refs:** — (new requirement; not in PRD v1)
- **Prerequisites:** S-02
- **Parallel with:** S-01, S-03, S-04, S-05, S-06
- **Blockers:** —
- **Unknowns:** —
- **Risk:** After this ships, the first session needs a Settings hop before paste-generate. A lost wrapping secret makes every stored key unreadable. Ciphertext is selectable by the owner JWT and must stay AES-GCM wrapped.
- **Status:** done



## Backlog Handoff


| Roadmap ID | Change ID                  | Suggested issue title                                  | Ready for `/10x-plan` | Notes                                                 |
| ---------- | -------------------------- | ------------------------------------------------------ | --------------------- | ----------------------------------------------------- |
| S-01       | paste-generate-typical-use | Paste text and generate typical-use cloze cards        | no                    | Done 2026-09-14 (`impl_reviewed`)                     |
| S-02       | email-password-account     | Email and password account so cards can bind to a user | no                    | Done 2026-09-14 (`impl_reviewed`)                     |
| S-03       | gate-generated-cards       | Accept, edit, or delete generated cards                | no                    | Done 2026-09-14 (`impl_reviewed`)                     |
| S-04       | srs-review-session         | Review kept cards with a ready-made SRS                | no                    | Done 2026-09-14 (`impl_reviewed`)                     |
| S-05       | manual-card-create         | Create a flashcard by hand                             | no                    | Done 2026-09-14 (`impl_reviewed`)                     |
| S-06       | browse-flashcards          | Browse saved flashcards                                | no                    | Done 2026-09-14 (`impl_reviewed`)                     |
| S-07       | user-openrouter-key        | Save an OpenRouter API key so generate uses that key   | no                    | Done 2026-09-14 (`impl_reviewed`)                     |




## Open Roadmap Questions

1. **PRD v1 first-session text does not mention adding an OpenRouter key** — Owner: user. Block: no. S-07 is on the milestone anyway; a later `/10x-prd` pass can add the FR.



## Parked

- **Custom advanced spaced-repetition algorithm** — Why parked: PRD §Non-Goals; MVP uses a ready-made algorithm only (S-04).
- **Import of many file formats (PDF, DOCX, etc.)** — Why parked: PRD §Non-Goals; input is paste of a word list or short text.
- **Sharing flashcard decks or team workspaces** — Why parked: PRD §Non-Goals; accounts are single-learner.
- **Integrations with other learning platforms** — Why parked: PRD §Non-Goals.
- **Mobile apps** — Why parked: PRD §Non-Goals; this MVP is a web app only.
- **Pronunciation scoring and AI conversation** — Why parked: PRD §Non-Goals.
- **Passwordless login** — Why parked: PRD §Non-Goals; MVP is email + password.
- **Optimizing for the 75% AI-accept / 75% AI-created secondary criteria** — Why parked: sequencing goal is speed, not market-feedback; S-01 still enforces the typical-use bar, but chasing those rates is deferred.



## Milestone History

- **M-1: First session from paste** (`first-session-from-paste`) — closed 2026-09-14. A signed-in self-learner can add an OpenRouter key, paste a word list or short text, get typical-use cloze cards, gate them, create or browse cards, and review with a ready-made SRS.

## Done

- **S-01: user can paste a word list or short text and receive typical-use cloze cards (gapped sentence, word/phrase, full sentence, short definition, collocation/pattern, Polish translation) that stay on their account; empty paste shows an explanatory empty-state, not a silent failure.** — Done 2026-09-14 → `context/changes/paste-generate-typical-use/` (`impl_reviewed`). Lesson: —.
- **S-02: user can create an account with email and password and sign in so later flashcards bind to that account; unauthenticated visitors cannot keep a saved deck.** — Done 2026-09-14 → `context/changes/email-password-account/` (`impl_reviewed`). Lesson: —.
- **S-03: user can accept, edit, or delete a generated flashcard before it is treated as kept for study.** — Done 2026-09-14 → `context/changes/gate-generated-cards/` (`impl_reviewed`). Lesson: —.
- **S-04: user can review their flashcards with a ready-made spaced-repetition algorithm.** — Done 2026-09-14 → `context/changes/srs-review-session/` (`impl_reviewed`). Lesson: —.
- **S-05: user can create a flashcard by hand with the same fields as generated cards, under the same typical-use bar.** — Done 2026-09-14 → `context/changes/manual-card-create/` (`impl_reviewed`). Lesson: —.
- **S-06: user can browse their flashcards.** — Done 2026-09-14 → `context/changes/browse-flashcards/` (`impl_reviewed`). Lesson: —.
- **S-07: user can add, replace, or remove their OpenRouter API key on their account; generate uses that key only (no operator env fallback); another account never sees the hint or uses the key.** — Done 2026-09-14 → `context/changes/user-openrouter-key/` (`impl_reviewed`). Lesson: —.

