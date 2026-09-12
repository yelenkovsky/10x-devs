---
project: "10xUsage"
context_type: greenfield
created: 2026-09-12
updated: 2026-09-12
timeline_budget:
  mvp_weeks: 3
  hard_deadline: null
  after_hours_only: true
product_type: web-app
target_scale:
  users: small
checkpoint:
  current_phase: 8
  phases_completed: [1, 2, 3, 4, 5, 6, 7]
  gray_areas_resolved:
    - topic: "pain category"
      decision: "Primary: workflow friction, missing typical-use capability, word lists/texts trapped until turned into cards, and decision paralysis on which sentence is typical enough. Secondary: coordination overhead when making cards with someone else."
    - topic: "insight"
      decision: "Quality means typical use (context, collocation, grammar pattern) — not impressive C1/C2 sentences."
    - topic: "primary persona scope"
      decision: "Adult self-learner who already uses spaced repetition and dreads making cards (individuals, not an org role, not a single named user)."
    - topic: "triggering moment"
      decision: "Right after meeting new words (article, class, conversation), when they want cards before they forget."
    - topic: "auth strategy"
      decision: "Email + password sign-up and login. Flat accounts: each user owns only their own flashcards. No admin/member/guest. Unauthenticated visitors do not get a saved deck. Passwordless was considered in Socrates and dropped for MVP."
    - topic: "mvp first session"
      decision: "Open app → create account and email+password sign-in → paste word list or short text → AI cloze cards (word/phrase, full sentence, definition, collocation/pattern, Polish translation) → accept/edit/delete (and manual create) → ready-made SRS review."
    - topic: "timeline"
      decision: "User committed to sustained-effort cost for this integration-heavy flow, then recorded mvp_weeks: 3. No hard deadline. After-hours only."
    - topic: "product framing"
      decision: "Web app. Target scale: just the builder or a handful (small). Typical-use rule does not change at 100×."
    - topic: "non-goals"
      decision: "No custom SRS; no PDF/DOCX import; no deck sharing; no RemNote/Anki integrations; no mobile; no pronunciation/AI conversation; no passwordless login."
  frs_drafted: 10
  quality_check_status: accepted
---

# 10xUsage — shape notes

## Vision & Problem Statement

Adult self-learners who already use spaced repetition hit the pain right after meeting new words (from an article, a class, or a conversation): turning a word list or short text into high-quality vocabulary flashcards is slow. High-quality here means cards that teach typical use of a word or phrase (context, collocation, grammar pattern), not “C1/C2-sounding” sentences. Manual authoring takes long enough that they under-use spaced repetition.

The insight the status quo misses: card quality is typical use, not impressive sentences. Existing authoring and generation produce or encourage advanced-sounding lines instead of collocation and grammar pattern. Word lists and short texts already exist; converting them is the gap. Learners also freeze on which sentence is typical enough to study. Coordination overhead when making cards with someone else (teacher, partner, class) is a secondary pain, not the primary persona. At 100× a handful of users, the typical-use rule does not change — scale is an operations problem later, not a different domain decision.

## User & Persona

**Name / role:** Adult self-learner who already uses spaced repetition and dreads making cards.

**Context:** They collect new vocabulary from input (reading, class, conversation) and want those items in a deck before they forget them.

**Moment they reach for the product:** Immediately after encountering new words, when they would otherwise face a long manual-authoring session (or skip making cards and weaken their SRS habit).

**Secondary (not MVP-defining):** Situations where cards are made with someone else (teacher, partner, class) — coordination overhead exists, but the primary actor is still the self-learner.

## Success Criteria

### Primary
- A new self-learner can complete the first session: open the app, create an account and sign in with email and password, paste a word list or short text, receive AI-generated cloze cards (word/phrase, full sentence, short definition, collocation/pattern, Polish translation), accept/edit/delete (or create a card by hand), and review those cards with a ready-made SRS algorithm.

### Secondary
- 75% of AI-generated flashcards are accepted by the user.
- Users create 75% of flashcards with AI.

### Guardrails
- Cards must not ship as C1/C2-sounding showpieces — the typical-use bar (context, collocation, grammar pattern) holds.
- Pasted word lists/texts are not shown to other users.
- A user never sees another account’s cards.
- Generation and review stay usable without a multi-second freeze with no feedback.

## User Stories

### US-01: Generate typical-use cloze cards from a paste and review them

- **Given** a self-learner signed in with email and password, with no cards yet (or an existing deck they own)
- **When** they paste a word list or short text and generate cards
- **Then** they see cloze cards (word/phrase, full sentence, short definition, collocation/pattern, Polish translation), can accept/edit/delete (or create by hand), cards persist on their account, and they can review them with a ready-made SRS

#### Acceptance Criteria
- Empty paste shows an explanatory empty-state, not a silent failure
- Another user’s cards never appear
- Typical-use bar holds: cards teach context, collocation, and grammar pattern — not C1/C2-sounding showpieces

### US-02: Create an account and sign in

- **Given** a self-learner who does not yet have an account
- **When** they register with email and password and then sign in
- **Then** they have an account of their own and can persist flashcards on it; they do not see anyone else’s cards

#### Acceptance Criteria
- Registration creates the account used for later sign-in
- Unauthenticated visitors cannot keep a saved deck

## Functional Requirements

### Authentication and persistence
- FR-001: Self-learner can sign in with email and password. Priority: must-have
  > Socrates: Counter-argument considered: "Email+password is simpler to operate than magic links for v1." Resolution: revised; MVP login is email + password; passwordless is out of MVP.
- FR-010: Self-learner can create an account with email and password. Priority: must-have
  > Socrates: Counter-argument considered: "Sign-in without sign-up leaves the auth rubric incomplete — a user cannot be tied to resources they never registered." Resolution: added as must-have after shape close; registration is required so login has an account to bind cards to.
- FR-009: Self-learner can keep flashcards on their account across sessions. Priority: must-have
  > Socrates: Counter-argument considered: "Cross-session storage without export locks the learner in"; "a refresh-lose-all prototype would validate generation faster." Resolution: kept; stands as written.

### Card generation
- FR-002: Self-learner can paste a word list or short text as input for card generation. Priority: must-have
  > Socrates: Counter-argument considered: "Word list and short text are different jobs; supporting both in v1 splits generation quality." Resolution: kept; stands as written.
- FR-003: Self-learner can generate cloze flashcards from that paste with AI. Priority: must-have
  > Socrates: Counter-argument considered: "A handful of hardcoded typical-use templates would prove the card shape without a generation dependency." Resolution: kept; live AI generation is the product, not a later add-on.
- FR-004: Self-learner can see on each card: cloze (gapped sentence), word/phrase, full sentence, short definition, collocation/pattern, and Polish translation. Priority: must-have
  > Socrates: Counter-argument considered: "Six fields per card is heavy"; "Polish translation couples the product to one L1." Resolution: kept; stands as written.

### Card management
- FR-005: Self-learner can accept, edit, or delete a generated flashcard. Priority: must-have
  > Socrates: Counter-argument considered: "Forcing accept/edit on every AI card recreates the authoring time we’re solving." Resolution: kept; stands as written.
- FR-006: Self-learner can create a flashcard by hand with the same card fields. Priority: must-have
  > Socrates: Counter-argument considered: "If 75% of cards should come from AI, manual create is a trap that delays the generator." Resolution: kept; stands as written.
- FR-007: Self-learner can browse their flashcards. Priority: must-have
  > Socrates: Counter-argument considered: "Browse-all is a card CMS; the SRS queue is the product." Resolution: kept; stands as written.

### Review
- FR-008: Self-learner can review their flashcards with a ready-made spaced-repetition algorithm. Priority: must-have
  > Socrates: Counter-argument considered: "Wiring SRS in v1 couples scheduling to unfinished card quality; a plain list proves generation first." Resolution: kept; stands as written.

## Non-Functional Requirements

- Pasted word lists and short texts are not visible to any other user.
- A signed-in user never sees another account’s cards.
- The learner sees continuous visible progress during any operation that takes longer than two seconds, and acknowledgement of shorter actions without a frozen screen.

## Business Logic

The app turns a pasted word list or short text into cloze cards that teach typical use (context, collocation, grammar pattern), not C1/C2-sounding sentences.

Inputs are a word list or short text the self-learner pastes, plus any edits they make on a card. Output is cloze cards with a gapped sentence, word/phrase, full sentence, short definition, collocation/pattern, and Polish translation — written for typical use, not advanced showpieces. The learner meets the rule after paste and generate, before they accept/edit/delete and review with SRS. Manual create uses the same card fields and the same typical-use bar.

## Access Control

Email + password sign-up and login. Simple user accounts store each self-learner’s flashcards.

Flat user model: every account owns only its own cards. No admin / member / guest roles. Unauthenticated visitors cannot keep a saved deck. Sharing flashcard decks between users is out of MVP. Passwordless (magic link / email one-time code) is out of MVP.

## Non-Goals

- Building a custom advanced spaced-repetition algorithm (SuperMemo / Anki / RemNote-class) — MVP uses a ready-made algorithm only.
- Import of many file formats (PDF, DOCX, etc.) — input is paste of a word list or short text.
- Sharing flashcard decks between users or team workspaces — accounts are single-learner.
- Integrations with RemNote, Anki, or other learning platforms.
- Mobile apps — this MVP is a web app only.
- Pronunciation scoring and AI conversation (speaking desk).
- Passwordless login (magic link / email one-time code) — MVP is email + password.

## Timeline acknowledgment

Acknowledged on 2026-09-12: 3-week MVP requires sustained dedication; user accepted. The first session depends on user accounts, AI generation, and a ready-made SRS; the user chose to keep that flow and record three weeks anyway.

## Quality cross-check

All six greenfield checks present. No gaps.

- Access Control: present
- Business Logic: present (one-sentence typical-use rule)
- Project artifacts: present
- Timeline-cost ack: present (`mvp_weeks: 3` and Timeline acknowledgment dated 2026-09-12)
- Non-Goals: present (seven entries)
- Preserved behavior: n/a (greenfield)
