# Email-password account — Plan Brief

> Full plan: `context/changes/email-password-account/plan.md`

## What & Why

A self-learner must create an email+password account and sign in so later flashcards bind to that identity; unauthenticated visitors cannot keep a saved deck (US-02, FR-001, FR-010). The starter already registers, signs in, and guards `/dashboard`. This slice closes the remaining gaps so that identity is session-honest and S-01 can attach cards without a guest deck.

## Starting Point

Cookie auth via `@supabase/ssr` is live. Signup always goes to `/auth/confirm-email` (DEV copy, not session). Sign-in dumps people on a starter home that still shouts Sign Up. Only `/dashboard` is protected. There is no card table, so “cannot keep a deck” is true only because nothing can be saved yet.

## Desired End State

Registering either lands the learner signed in on `/dashboard` (local confirmations off) or on sign-in with a generic “check email / sign in if you already have an account” notice (hosted confirmation on). After sign-in they reach `/dashboard` or the protected URL they were bounced from. Home CTAs match the session. S-01 adds deck routes to one protected list and JSON writes to one `requireUser` helper.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Card persistence | Out of this slice | S-01 owns schema/RLS/generate; this slice is identity + contract | Roadmap / Plan |
| Confirmation | Prod on, local off; branch on session, no PKCE callback | Matches hosted deploy-plan without blocking local first session | Plan |
| Duplicate vs new unconfirmed | Same no-session path + generic notice | Avoids email enumeration via different success screens | Plan |
| Guest deck | Contract in `PROTECTED_ROUTES` + `requireUser`; no dummy save UI | First real save surface is S-01 | Plan |
| After sign-in | `/dashboard`, plus safe `next` from bounce | Fixes bounce → home dead-end | Plan |
| Already signed in on auth pages | Redirect to `/dashboard` (or `next`) | Prevents a second signup while a session exists | Plan |
| Errors | Map `error.code` to stable copy; no raw `error.message` in URLs | Unconfirmed users get a next step; URLs stay clean | Plan |
| Verification | Lint + build; manual first-session checklist; no new test runner | Repo has no test harness; slice is gap-closing | Plan |

## Scope

**In scope:** zod + `src/lib/auth.ts`; signup/signin/signout validation and redirects; middleware bounce + guest-only auth pages; session-aware home CTAs; confirm-email keyed off `locals.user`.

**Out of scope:** cards/paste/generate; passwordless/reset/OAuth/PKCE callback; test runner; Welcome marketing rewrite; guest `localStorage` decks.

## Architecture / Approach

Browser POSTs forms to `/api/auth/*`. Handlers validate with zod, talk to Supabase, set cookies, 303 to a `safeReturnPath`. Middleware attaches `locals.user`, guards `PROTECTED_ROUTES`, and sends signed-in users away from `/auth/signin` and `/auth/signup`. Future S-01 HTML routes join `PROTECTED_ROUTES`; JSON writes call `requireUser` (401, not an HTML redirect).

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Shared auth contract | zod + `src/lib/auth.ts` (paths, `next`, errors, `requireUser`) | Open-redirect rules too loose or too strict |
| 2. Sign-up and sign-in API | Session vs notice branching; `/dashboard` + `next`; mapped errors | Duplicate/obfuscated signup still looks like success |
| 3. Middleware and chrome | Bounce-back, guest-only auth pages, session-aware home | Auth-page redirect loops with `next` |

**Prerequisites:** Local `.dev.vars` + Supabase (Docker or hosted). Hosted confirmation settings stay as deployed.
**Estimated effort:** ~1–2 sessions across 3 phases.

## Open Risks & Assumptions

- Hosted confirmation still uses Supabase’s verify link then password sign-in; no in-app callback.
- No-session signup cannot tell a new unconfirmed user from an obfuscated duplicate; shared copy is intentional.
- Guest-save remains un-demoable until S-01 adds a persist path.
- Hosted Free email rate limits can block a live sign-up smoke test.

## Success Criteria (Summary)

- New local sign-up reaches `/dashboard` signed in; duplicate sign-up shows the generic sign-in notice.
- Guest `/dashboard` bounces to sign-in and returns there after login; signed-in auth pages do not show forms.
- Unauthenticated visitors still have no way to persist a deck; S-01 has a listed place to add that rule.
