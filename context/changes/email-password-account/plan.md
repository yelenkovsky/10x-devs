# Email-password account Implementation Plan

## Overview

Close the remaining US-02 gaps on top of the starter’s working email+password auth: a learner can register, end in a usable session (or a confirmation-then-sign-in path), land on a signed-in surface, and later slices can require that session before anything is saved as a deck. Card tables, paste, and generate stay out of this change.

## Current State Analysis

Email+password sign-up, sign-in, sign-out, cookie sessions via `@supabase/ssr`, and a `/dashboard` guard already work in this repo and on the hosted Worker. `PROTECTED_ROUTES` is only `["/dashboard"]` (`src/middleware.ts`). There is no card schema, no guest/anonymous deck, and no `localStorage` product state, so “unauthenticated visitors cannot keep a saved deck” is vacuously true today and will leak the first time S-01 adds a public save path.

Signup always redirects to `/auth/confirm-email` and discards `data.session` / `data.user` (`src/pages/api/auth/signup.ts`). Confirm-email copy is keyed off `import.meta.env.DEV`, not whether a session exists (`src/pages/auth/confirm-email.astro`). Local Auth has `enable_confirmations = false`; hosted production was locked with confirmation on (`context/deployment/deploy-plan.md`). Duplicate signup with confirmations on is obfuscated (no error); with confirmations off it errors as already registered.

Sign-in success always goes to `/` (`src/pages/api/auth/signin.ts`). Home still shows Sign In / Sign Up as primary CTAs even when `locals.user` is set (`src/components/Welcome.astro`). Middleware bounce to `/auth/signin` drops the original path. Auth pages do not redirect signed-in visitors. API routes have no zod validation, no `prerender = false`, and put raw `error.message` in `?error=`. There is no test runner; CI is lint + build.

## Desired End State

A new learner can create an account with email and password and reach a signed-in `/dashboard` (or return to the protected path they were bounced from). If production confirmation is on and no session is issued, they land on sign-in with a generic next-step notice (check email / sign in if they already have an account), then sign in after confirming. Unauthenticated visitors still cannot reach `/dashboard`, and S-01 can add deck-persisting routes/APIs to a shared auth contract without inventing a second guest model. Verify by walking the first-session auth path in the browser (register, session-or-notice branch, sign in, dashboard, sign out, guest bounce, already-signed-in redirect). Lint and build stay green.

### Key Discoveries:

- Signup inspects only `error` and always redirects to `/auth/confirm-email` (`src/pages/api/auth/signup.ts:13-19`); `AuthResponse` includes `user` and `session` that this app ignores.
- Confirm-email uses `import.meta.env.DEV` (`src/pages/auth/confirm-email.astro:4`), which does not match local vs hosted confirmation settings.
- Unauthenticated `/dashboard` redirects to `/auth/signin` with no return path (`src/middleware.ts:18-20`); sign-in success always goes to `/` (`src/pages/api/auth/signin.ts:19`).
- GoTrue duplicate signup: confirmations on → fake user and no error; confirmations off → `User already registered`. Empty `identities` is not the documented signal.
- `AGENTS.md` requires zod and `prerender = false` on API routes; `zod` is not a direct dependency; none of the three auth routes export `prerender`.
- POST auth handlers use default 302 redirects; session cookies are set on that same response via `cookies.set` in `src/lib/supabase.ts:17-20`. Middleware `getUser()` on the POST does not see the new session.

## What We're NOT Doing

- Card schema, RLS, paste/generate, or any save-deck UI (S-01).
- Passwordless login, OAuth, password reset, or a PKCE `/auth/callback` unless hosted verify links are later shown to fail.
- Guest, anonymous, or `localStorage` decks.
- A test runner, Vitest, or Playwright.
- Rewriting Welcome feature cards, the Polish missing-config banner, or starter naming beyond session-aware home CTAs.
- Fixing `SubmitButton` / `useFormStatus` on native HTML POSTs.

## Implementation Approach

Keep the starter’s cookie session model. Extract a small `src/lib/auth.ts` that owns protected-path matching, a safe return-path parser, mapped auth errors, credential schemas, and an API `requireUser` helper for S-01. Point middleware and the three auth API routes at that module. Signup branches on **session present vs absent**, not on DEV and not on an identities heuristic: session → signed-in landing; no session or “already registered” → sign-in with the same generic notice. Sign-in defaults to `/dashboard` and honors a validated `next` from the middleware bounce. Auth pages are guest-only. Home CTAs become session-aware. No new product routes in this slice.

## Critical Implementation Details

### Timing & lifecycle

Middleware runs `getUser()` before the POST handler. The session created by `signInWithPassword` / `signUp` exists only as `Set-Cookie` on that handler’s redirect. Do not try to read the new user in middleware on the same POST. Set cookies on the `AstroCookies` instance **before** returning `context.redirect`. Use 303 after POST so a refresh does not resubmit the form.

### State sequencing

Do not put `/auth/confirm-email` on the signed-in-users-leave-auth-pages list with a prefix match on `/auth` — that would skip the page for auto-confirmed users and can loop with `next`. Guest-only paths are exact `/auth/signin` and `/auth/signup`. Confirm-email stays reachable; if `locals.user` is set there, send them to `/dashboard`.

### Debug & observability

Raw Supabase `error.message` must not appear in query strings. Map `error.code` first (`invalid_credentials`, `email_not_confirmed`, `user_already_exists`, `email_exists`, `weak_password`, `over_request_rate_limit`, `over_email_send_rate_limit`), then fall back to a generic line. A missing Supabase client is not mapped at all: `src/layouts/Layout.astro` already renders the missing-config banner on every auth page from `src/lib/config-status.ts`, so the handler redirects back with no message rather than stacking a second copy under that banner.

---

## Phase 1: Shared auth contract

### Overview

Add zod and a single `src/lib/auth.ts` that later phases (and S-01) import, so return-path safety, error mapping, and “writes need a user” are not re-invented in middleware vs API routes.

### Changes Required:

#### 1. Direct zod dependency

**File**: `package.json`

**Intent**: Make zod a first-class app dependency so API validation matches `AGENTS.md` instead of relying on Astro’s transitive copy.

**Contract**: `"zod"` appears under `dependencies` (not only `devDependencies`). Install with npm so the lockfile updates.

#### 2. Auth helpers

**File**: `src/lib/auth.ts` (new)

**Intent**: One module for the US-02 contract: which HTML paths require a session, how to bounce back safely, how auth failures are phrased, how credentials are validated, and how future JSON APIs refuse anonymous writes.

**Contract**:

- `PROTECTED_ROUTES` includes `/dashboard`. Match a path only on the same segment (`path === route` or `path.startsWith(route + "/")`), not `startsWith("/dashboard")` alone.
- `safeReturnPath(raw)`: parse, do not pattern-match. Reject a missing or non-string `raw`. Otherwise parse with `new URL(raw, base)` where `base` is the current request origin, and reject when `url.origin !== base.origin`. Then **re-serialize** as `url.pathname + url.search` and reject that string when it starts with `//`, or when `url.pathname` is `/auth/signin`, `/auth/signup`, or `/auth/confirm-email`. Any rejection → `/dashboard`. Return the re-serialized string, never `raw`.
  - The post-parse `//` check is load-bearing, not redundant with the origin check. WHATWG URL parsing strips tabs and newlines while parsing, so `next=/%09//evil.com` normalizes to pathname `//evil.com` with an unchanged origin — an origin-only check passes it, and emitting it as a `Location` gives the browser a protocol-relative off-origin redirect. Do not simplify this check away.
  - Returning the re-serialized string rather than `raw` is what keeps decoded control characters (`%09`, `%0A`, `%0D`) out of the `Location` header in the first place.
- `mapAuthError(error)`: returns `{ page: "signin" | "signup"; message: string }` from `AuthError.code` (then a generic fallback). `invalid_credentials` and unknown sign-in failures share one generic credentials line. `email_not_confirmed` tells them to check email. `user_already_exists` / `email_exists` use the **same** generic notice as a no-session signup (not “this email is taken”). Rate limit and weak password get stable copy. A missing Supabase client is out of scope for this mapper — the handler redirects back with no message and the existing `Layout.astro` banner covers it.
- `credentialsSchema`: zod object with trimmed email and password minimum length 6 (matches `SignUpForm` and `supabase/config.toml`).
- `requireUser(locals)`: if `locals.user` is missing, return a 401 JSON body `{ error: string }` suitable for future S-01 `fetch` handlers (not a redirect to HTML). Pages keep using middleware redirects.

```ts
// Return-path rule: parse with new URL(raw, base), require same origin,
// re-serialize as pathname + search, then reject a leading "//" or an
// auth pathname. Return the re-serialized string, never the raw input.
```

### Success Criteria:

#### Automated Verification:

- `zod` is listed under `dependencies` in `package.json`
- `npx astro sync` succeeds
- `npm run lint` succeeds
- `npm run build` succeeds

---

## Phase 2: Sign-up and sign-in API

### Overview

Make the three auth POST handlers validate input, branch signup on session vs notice, land sign-in on `/dashboard` or a safe `next`, and stop putting raw provider messages in URLs.

### Changes Required:

#### 1. Sign-up handler

**File**: `src/pages/api/auth/signup.ts`

**Intent**: Create the account used for later sign-in, and send the browser somewhere that matches whether a session was actually issued.

**Contract**: Export `const prerender = false`. Validate `email` and `password` with `credentialsSchema` (ignore `confirmPassword` on the server). Read `next` from `form.get("next")` — the hidden body field is the only transport (§4). After `signUp`: if `data.session` is set, 303 to `safeReturnPath(next)` (default `/dashboard`); if Supabase returns `user_already_exists` / `email_exists`, or success with **no** session, 303 to `/auth/signin` with a **notice** query (not `error`) whose copy is generic: they should sign in if they already have an account, and check email if they just registered. Other failures 303 back to `/auth/signup` with mapped `error` copy. Preserve `next` on error/notice redirects when it is safe. Do not redirect successful no-session signups to `/auth/confirm-email`.

Pass `options.emailRedirectTo` on `signUp`, built as an absolute URL for `/auth/confirm-email` on the current request origin. Without it Supabase falls back to the project Site URL — the Worker root per `context/deployment/deploy-plan.md` — and the hosted verify link dumps the learner on the guest home with no acknowledgment. The hosted redirect allowlist is already `/**` on that origin, so no Supabase dashboard change is needed.

#### 2. Sign-in handler

**File**: `src/pages/api/auth/signin.ts`

**Intent**: Establish the cookie session and take them to the signed-in surface they asked for.

**Contract**: Export `const prerender = false`. Validate with `credentialsSchema`. Read `next` from `form.get("next")` (§4). On success, 303 to `safeReturnPath(next)`. On failure, 303 to `/auth/signin` with mapped `error` (and preserved safe `next`). Unconfirmed email uses the mapped check-email copy.

#### 3. Sign-out handler

**File**: `src/pages/api/auth/signout.ts`

**Intent**: Clear the session and return to the public home without changing product scope.

**Contract**: Export `const prerender = false`. Keep sign-out → `/`. Prefer 303 after POST.

#### 4. Auth forms pass `next`

**Files**: `src/components/auth/SignInForm.tsx`, `src/components/auth/SignUpForm.tsx`, `src/pages/auth/signin.astro`, `src/pages/auth/signup.astro`

**Intent**: A bounce `?next=` must survive the POST, including after a validation error redirect.

**Contract**: Pages read `next` (and `error` / `notice`) from the query string. Forms carry it forward as a hidden body field, `<input type="hidden" name="next">`, and that body field is the **only** transport the handlers read — do not also append `next` to the form `action`. `FormField` cannot render it (it always emits a label, icon, and error markup, and forwards `name ?? id` to the input), so emit the raw input. Render it only when the page's `next` is a `safeReturnPath` other than the default. `notice` is rendered by the `.astro` page above the form island, in its own neutral banner markup — not by the React forms and not through `ServerError.tsx`, whose red styling is hard-coded and which stays untouched. `error` keeps going through the forms' existing `serverError` prop. Cross-links between sign-in and sign-up preserve `next` in their hrefs.

### Success Criteria:

#### Automated Verification:

- `src/pages/api/auth/signin.ts`, `signup.ts`, and `signout.ts` each export `const prerender = false`
- `npx astro sync` succeeds
- `npm run lint` succeeds
- `npm run build` succeeds

#### Manual Verification:

- With local confirmations off, a new sign-up issues a session and the browser lands on `/dashboard` (or the supplied safe `next`)
- Signing up again with that same email does not show a “account created / check email” success page; it shows the generic notice on sign-in
- Wrong password shows mapped copy; the URL does not contain a raw Supabase `error.message`
- A safe hidden/query `next` is honored; `next=https://example.com`, `next=//evil`, and `next=/%09//evil.com` all land on `/dashboard`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Middleware, guest contract, and signed-in chrome

### Overview

Enforce the session on protected HTML, send signed-in visitors away from auth forms, make home honest about the session, and leave S-01 a single list/helper to extend when decks exist.

### Changes Required:

#### 1. Middleware

**File**: `src/middleware.ts`

**Intent**: Unauthenticated visitors cannot open protected HTML; signed-in visitors do not re-submit account forms; bounce-back is possible without an open redirect.

**Contract**: Import `PROTECTED_ROUTES` (or the path matcher) from `src/lib/auth.ts`. Unauthenticated hits on protected paths 302 to `/auth/signin?next=...` using `safeReturnPath` of `pathname + search`. Signed-in hits on exact `/auth/signin` and `/auth/signup` 302 to `safeReturnPath(next)` (default `/dashboard`). Do not guest-guard `/auth/confirm-email` or `/api/auth/*`. Add a short comment that any S-01 HTML route which keeps a deck must be appended to `PROTECTED_ROUTES`, and any JSON write must call `requireUser`.

#### 2. Confirm-email page

**File**: `src/pages/auth/confirm-email.astro`

**Intent**: Stop lying about DEV vs production. Signup no longer sends people here directly, but this is now where the hosted confirmation link lands (Phase 2 §1 `emailRedirectTo`), so it is the last screen of the production first-session path.

**Contract**: If `Astro.locals.user` is set, redirect to `/dashboard`. Otherwise branch on `code` in the query string rather than `import.meta.env.DEV`: with `code` present the visitor just followed a verify link, so show confirmed copy and a link to `/auth/signin`; without it show check-email copy and the same link. Do not exchange the `code` — no session is established here, and password sign-in is the next step either way.

#### 3. Session-aware home CTAs

**File**: `src/components/Welcome.astro`

**Intent**: A signed-in learner must not be pushed to Sign In / Sign Up as the only next step.

**Contract**: When `Astro.locals.user` is set, the hero primary CTA goes to `/dashboard` (label along the lines of continue / dashboard). Do not show Sign In / Sign Up as the hero pair. Guest hero keeps Sign In and Sign Up. Do not rewrite the three feature cards.

#### 4. Auth page signed-in redirect (pages)

**Files**: `src/pages/auth/signin.astro`, `src/pages/auth/signup.astro`

**Intent**: Defense in depth if middleware is skipped in a future refactor; pages still must not render account forms to a session user.

**Contract**: If `Astro.locals.user` is set, redirect with the same `safeReturnPath(next)` default `/dashboard` rule. Unsigned pages still show forms plus `error` / `notice`.

### Success Criteria:

#### Automated Verification:

- `npx astro sync` succeeds
- `npm run lint` succeeds
- `npm run build` succeeds

#### Manual Verification:

- Unauthenticated `/dashboard` redirects to exactly `/auth/signin?next=%2Fdashboard` — assert on that URL, because `/dashboard` is also the fallback and a broken `next` would still land correctly — and signing in from there returns to `/dashboard`
- Signed-in `/auth/signin` and `/auth/signup` redirect to `/dashboard` without showing the forms
- Signed-in home hero does not use Sign In / Sign Up as the primary pair; guest home still does
- Sign out returns to `/` and `/dashboard` is guarded again
- Opening `/auth/confirm-email` while signed in goes to `/dashboard`; while signed out shows check-email copy (not DEV-based “you can now sign in” in production builds)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- None. No test runner in this slice.

### Integration Tests:

- None in CI. Automated checks are `npx astro sync`, `npm run lint`, and `npm run build`.

### Manual Testing Steps:

1. Start from a signed-out browser (or private window) with local Supabase (`enable_confirmations = false`).
2. Register a new email+password → expect `/dashboard` and Topbar email, not confirm-email.
3. Sign out → home shows Sign In / Sign Up; `/dashboard` bounces to sign-in with `next`.
4. Sign in from that bounce → land on `/dashboard` again.
5. Open `/auth/signup` while signed in → redirect to `/dashboard`.
6. Sign out. Submit sign-up with the same email → generic notice on sign-in, not a new-account success page. Sign in with the correct password still works.
7. Submit sign-in with the wrong password → mapped copy; URL has no raw provider message.
8. As a guest, POST or navigate with `next=//example.com` after a fake login attempt → end on `/dashboard` after a real login, never off-origin.
9. If checking hosted production: new sign-up with confirmation on → no session, generic notice on sign-in; before confirming, sign-in shows check-email copy; clicking the emailed verify link lands on `/auth/confirm-email` with confirmed copy, not the guest home; after confirming (Supabase email or Studio), password sign-in reaches `/dashboard`. Skip the unconfirmed branch locally unless confirmations are temporarily enabled.

## Performance Considerations

Auth remains one `getUser()` per request (already true). No extra client islands. No caching of session cookies beyond `@supabase/ssr` defaults.

## Migration Notes

No database migrations. Hosted Auth stays confirmation-on as in `context/deployment/deploy-plan.md`; local stays confirmation-off. Do not flip those project settings in this change. Existing `auth.users` rows keep working. No PKCE callback is added; hosted confirmation still depends on Supabase’s verify link then password sign-in. `@supabase/ssr` hard-codes `flowType: "pkce"`, so the verify link returns a `?code=` that `/auth/confirm-email` deliberately does not exchange — the page only acknowledges the click and points at sign-in.

## References

- Roadmap S-02: `context/foundation/roadmap.md`
- PRD US-02, FR-001, FR-010, Access Control: `context/foundation/prd.md`
- Deploy / hosted confirmation: `context/deployment/deploy-plan.md`
- Starter auth: `src/middleware.ts`, `src/pages/api/auth/*.ts`, `src/lib/supabase.ts`
- S-01 (card bind): `paste-generate-typical-use` — not this folder

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Shared auth contract

#### Automated

- [ ] 1.1 `zod` is listed under `dependencies` in `package.json`
- [ ] 1.2 `npx astro sync` succeeds
- [ ] 1.3 `npm run lint` succeeds
- [ ] 1.4 `npm run build` succeeds

### Phase 2: Sign-up and sign-in API

#### Automated

- [ ] 2.1 `src/pages/api/auth/signin.ts`, `signup.ts`, and `signout.ts` each export `const prerender = false`
- [ ] 2.2 `npx astro sync` succeeds
- [ ] 2.3 `npm run lint` succeeds
- [ ] 2.4 `npm run build` succeeds

#### Manual

- [ ] 2.5 With local confirmations off, a new sign-up issues a session and the browser lands on `/dashboard` (or the supplied safe `next`)
- [ ] 2.6 Signing up again with that same email does not show a “account created / check email” success page; it shows the generic notice on sign-in
- [ ] 2.7 Wrong password shows mapped copy; the URL does not contain a raw Supabase `error.message`
- [ ] 2.8 A safe hidden/query `next` is honored; `next=https://example.com`, `next=//evil`, and `next=/%09//evil.com` all land on `/dashboard`

### Phase 3: Middleware, guest contract, and signed-in chrome

#### Automated

- [ ] 3.1 `npx astro sync` succeeds
- [ ] 3.2 `npm run lint` succeeds
- [ ] 3.3 `npm run build` succeeds

#### Manual

- [ ] 3.4 Unauthenticated `/dashboard` redirects to exactly `/auth/signin?next=%2Fdashboard` — assert on that URL, because `/dashboard` is also the fallback and a broken `next` would still land correctly — and signing in from there returns to `/dashboard`
- [ ] 3.5 Signed-in `/auth/signin` and `/auth/signup` redirect to `/dashboard` without showing the forms
- [ ] 3.6 Signed-in home hero does not use Sign In / Sign Up as the primary pair; guest home still does
- [ ] 3.7 Sign out returns to `/` and `/dashboard` is guarded again
- [ ] 3.8 Opening `/auth/confirm-email` while signed in goes to `/dashboard`; while signed out shows check-email copy (not DEV-based “you can now sign in” in production builds)
