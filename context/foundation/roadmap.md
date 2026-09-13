---
project: 10xUsage
version: 1
status: draft
created: 2026-09-13
updated: 2026-09-13
prd_version: 1
main_goal: speed
top_blocker: time
milestone_id: first-session-from-paste
milestone_seq: 1
milestone_status: open
---

# Roadmap: 10xUsage

> Derived from `context/foundation/prd.md` (v1) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Milestone

**M-1: First session from paste** — Status: open

- **Intent:** A self-learner can finish the first session in the Success Criteria: register and sign in, paste a word list or short text, receive typical-use cloze cards, accept/edit/delete them (or create one by hand), and review with a ready-made spaced-repetition algorithm.
- **Source materials:** `context/foundation/prd.md` (v1)
- **Done when:** every S-NN below is `done`.
- **Scope anchors:** US-01, US-02, FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-007, FR-008, FR-009, FR-010 (all required FRs in this PRD).



## Vision recap

Adult self-learners who already use spaced repetition stall right after meeting new words: turning a word list or short text into flashcards that teach typical use (context, collocation, grammar pattern) takes long enough that they skip the cards. Quality here means typical use, not impressive C1/C2 sentences. 10xUsage exists to convert text the learner already has into those cards so the spaced-repetition habit holds.

## North star

The north star — the smallest end-to-end slice whose successful delivery would prove the product idea, placed as early as Prerequisites allow because everything else only matters if this works — is **S-01: User can paste a word list or short text and get typical-use cloze cards on their account**. Live generation is the product (FR-003), auth is already in the baseline, and the sequencing goal is speed.

## At a glance


| ID   | Change ID                  | Outcome (user can …)                                                             | Prerequisites | PRD refs                              | Status   |
| ---- | -------------------------- | -------------------------------------------------------------------------------- | ------------- | ------------------------------------- | -------- |
| S-01 | paste-generate-typical-use | paste a word list or short text and get typical-use cloze cards on their account | —             | US-01, FR-002, FR-003, FR-004, FR-009 | ready    |
| S-02 | email-password-account     | create an account with email and password and sign in                            | —             | US-02, FR-001, FR-010                 | in-progress |
| S-03 | gate-generated-cards       | accept, edit, or delete a generated flashcard                                    | S-01          | US-01, FR-005                         | proposed |
| S-04 | srs-review-session         | review their flashcards with a ready-made spaced-repetition algorithm            | S-03          | US-01, FR-008                         | proposed |
| S-05 | manual-card-create         | create a flashcard by hand with the same fields as generated cards               | S-01          | US-01, FR-006                         | proposed |
| S-06 | browse-flashcards          | browse their flashcards                                                          | S-01          | FR-007                                | proposed |




## Streams

Navigation aid — groups items that share a Prerequisites chain. Canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks.


| Stream | Theme           | Chain                    | Note                                                                                               |
| ------ | --------------- | ------------------------ | -------------------------------------------------------------------------------------------------- |
| A      | First session   | `S-01` → `S-03` → `S-04` | Speed path: generate, then gate, then review — closes the first session.                           |
| B      | Account         | `S-02`                   | Standalone; sessions already exist in the baseline, so this can run beside Stream A.               |
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
- **Parallel with:** S-02
- **Blockers:** —
- **Unknowns:**
  - How to check the typical-use bar (context, collocation, grammar pattern — not C1/C2 showpieces) on generated cards without a labeled eval set — Owner: user. Block: no.
- **Risk:** This is the first proving story and the slowest new integration (live generation plus first card persistence and isolation). Generation may take more than two seconds; this slice must show continuous progress and must not leak pastes or cards across accounts. Relies on existing signed-in sessions from the baseline.
- **Status:** ready



### S-02: Create an account and sign in

- **Outcome:** user can create an account with email and password and sign in so later flashcards bind to that account; unauthenticated visitors cannot keep a saved deck.
- **Change ID:** email-password-account
- **PRD refs:** US-02, FR-001, FR-010
- **Prerequisites:** —
- **Parallel with:** S-01, S-03, S-04, S-05, S-06
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Auth is already present in the baseline; this slice exists so US-02 stays on the roadmap and any remaining gaps (unauthenticated visitors keeping a deck) get closed. It is not a reason to defer S-01.
- **Status:** in-progress



### S-03: Accept, edit, or delete generated cards

- **Outcome:** user can accept, edit, or delete a generated flashcard before it is treated as kept for study.
- **Change ID:** gate-generated-cards
- **PRD refs:** US-01, FR-005
- **Prerequisites:** S-01
- **Parallel with:** S-02, S-05, S-06
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Without this gate, generated cards land in the deck unreviewed and the first session skips a required step. Sequenced immediately after S-01 so review (S-04) can use kept cards, not raw model output.
- **Status:** proposed



### S-04: Review cards with a ready-made SRS

- **Outcome:** user can review their flashcards with a ready-made spaced-repetition algorithm.
- **Change ID:** srs-review-session
- **PRD refs:** US-01, FR-008
- **Prerequisites:** S-03
- **Parallel with:** S-02, S-05, S-06
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Closes the first session. Custom scheduling is a Non-Goal; this slice only wires a ready-made algorithm onto kept cards. Sequenced before browse/manual-create so the Success Criteria session is complete before collection extras.
- **Status:** proposed



### S-05: Create a flashcard by hand

- **Outcome:** user can create a flashcard by hand with the same fields as generated cards, under the same typical-use bar.
- **Change ID:** manual-card-create
- **PRD refs:** US-01, FR-006
- **Prerequisites:** S-01
- **Parallel with:** S-02, S-03, S-04, S-06
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Required, but not on the paste-generate-review path. Sequenced after the first session because the goal is speed; it still depends only on the card shape from S-01.
- **Status:** proposed



### S-06: Browse flashcards

- **Outcome:** user can browse their flashcards.
- **Change ID:** browse-flashcards
- **PRD refs:** FR-007
- **Prerequisites:** S-01
- **Parallel with:** S-02, S-03, S-04, S-05
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Required, but the first session is a review queue, not a card catalog. Sequenced last so speed does not spend the first proving story on a browse-all surface.
- **Status:** proposed



## Backlog Handoff


| Roadmap ID | Change ID                  | Suggested issue title                                  | Ready for `/10x-plan` | Notes                                                |
| ---------- | -------------------------- | ------------------------------------------------------ | --------------------- | ---------------------------------------------------- |
| S-01       | paste-generate-typical-use | Paste text and generate typical-use cloze cards        | yes                   | Run `/10x-plan paste-generate-typical-use`           |
| S-02       | email-password-account     | Email and password account so cards can bind to a user | yes                   | Auth already present; plan only remaining US-02 gaps |
| S-03       | gate-generated-cards       | Accept, edit, or delete generated cards                | no                    | Waits on S-01                                        |
| S-04       | srs-review-session         | Review kept cards with a ready-made SRS                | no                    | Waits on S-03                                        |
| S-05       | manual-card-create         | Create a flashcard by hand                             | no                    | Waits on S-01; not on the first-session path         |
| S-06       | browse-flashcards          | Browse saved flashcards                                | no                    | Waits on S-01; not on the first-session path         |




## Open Roadmap Questions

None. The PRD Open Questions section is empty, and this milestone did not add a cross-cutting question.

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



## Done

