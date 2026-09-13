# User OpenRouter API Key Implementation Plan

## Overview

A signed-in learner saves their own OpenRouter API key on `/settings`, then generate uses that key only. The operator env key is no longer used for generate. One key per account (replace in place), last-4 shown, never echoed. Missing or rejected keys fail out loud and send the learner to Settings.

## Current State Analysis

Generate is a single `POST /api/cards/generate` → `generateCards` → `fetch` to OpenRouter with `Authorization: Bearer ${OPENROUTER_API_KEY}` from `astro:env/server` (`src/lib/services/generate-cards.ts`). There is no per-user secret table. `Boolean(OPENROUTER_API_KEY)` drives a site-wide Polish banner on every `Layout` page (`src/lib/config-status.ts`, `src/layouts/Layout.astro`). OpenRouter HTTP 401 is collapsed into `generation_unavailable`. Generate stays clickable even when the env key is missing.

Topbar is Dashboard / Cards / Review (`src/components/Topbar.astro`). `PROTECTED_ROUTES` is `/dashboard`, `/review`, `/cards` (`src/lib/auth.ts`). There is no settings or profile route.

S-01 treated cost and rate limits as out of band and the key as one Worker secret. This change reverses that for generate: the learner pays with their OpenRouter key. The current milestone (M-1) had no such slice; S-07 is added on the roadmap as part of this plan.

Official OpenRouter user keys look like `sk-or-v1-` plus 64 hex characters. Save validation is the agreed `sk-or-` prefix (plus non-empty / no interior whitespace), not a live OpenRouter call.

## Desired End State

After sign-in, the learner can open Settings from the Topbar, paste an OpenRouter key, see only the last four characters, replace or remove it, and return to `/dashboard`. Generate is disabled with a Settings CTA until a key exists. Once saved, paste-generate calls OpenRouter with that decrypted key. Another account never sees the hint or uses the key. A rejected key (`401`/`403`) tells them to replace it in Settings. The site-wide OpenRouter “not configured” banner is gone. Verify by walking save → generate → replace → generate → remove → disabled generate, plus a two-account isolation check. Lint, typecheck-via-build, and `npm test` stay green.

### Key Discoveries:

- `requireUser` is the JSON write contract; HTML joins `PROTECTED_ROUTES` (`src/lib/auth.ts`, `src/middleware.ts`).
- First product table already uses `(select auth.uid()) = user_id`, four `authenticated` policies, revoke `anon`/`public` (`supabase/migrations/20260913152707_create_flashcards.sql`). UPDATE needs SELECT or it silently hits 0 rows.
- The SSR client is the user JWT + publishable `SUPABASE_KEY`. There is no service-role client. Generate can `SELECT` the owner’s ciphertext and decrypt on the server.
- Workers implement Web Crypto `crypto.subtle` including AES-GCM (`https://developers.cloudflare.com/workers/runtime-apis/web-crypto/`).
- `FormField` + `PasswordToggle` already own the secret-input pattern (`src/components/auth/FormField.tsx`, `SignInForm.tsx`).
- Vitest is in the repo (`npm test`, `vitest.config.ts`). `envGetSecret` is `"unsupported"` in the test adapter — mock `astro:env/server` in tests that import it. `PasteGenerate.test.tsx` stubs `/api/cards/generate` and does not cover `generation_not_configured`.
- Do not invent a migration filename; use `npx supabase migration new …` (Supabase skill).

## What We're NOT Doing

- Operator `OPENROUTER_API_KEY` as a generate fallback.
- Live OpenRouter validation on save.
- Multiple keys or an “active” picker.
- A model picker (keep `OPENROUTER_MODEL` as the operator env default).
- Supabase Vault / pgsodium, or a service-role Supabase client.
- Echoing the full key to the browser after save.
- Auto-deleting the stored key on OpenRouter `401`.
- Rewriting `context/foundation/prd.md` (first-session text will be stale until a later PRD pass).
- Payments, credit quotas, or OpenRouter account linking/OAuth.
- Changing card schema, paste caps, or the typical-use prompt.

## Implementation Approach

Keep the cookie session and user-JWT SSR client. Add one row per user for ciphertext + nonce + last-4, encrypted with a new server-only `USER_SECRETS_KEY` via Web Crypto AES-GCM. Settings is a protected HTML page plus `POST`/`DELETE` JSON. Generate loads that row, decrypts, and sends the plaintext only to OpenRouter. Drop OpenRouter from `config-status`. Dashboard SSR passes `configured` into the paste island so Generate can stay disabled without a fetch.

## Critical Implementation Details

### Timing & lifecycle

Decrypt, then call OpenRouter, then persist cards — same sequential outbound order as S-01. Do not pass the key through the generate request body. A missing `USER_SECRETS_KEY` is an operator failure (banner + 503 on save), not “add your OpenRouter key.”

### User experience spec

The settings input is always empty after load. Show last-4 when a key exists. Generate on `/dashboard` is disabled when `configured` is false; the CTA is a link to `/settings`. Do not special-case `generation_not_configured` as an empty-paste state.

### Debug & observability

Do not log the plaintext key, ciphertext, nonce, or `USER_SECRETS_KEY`. Do not put raw OpenRouter bodies in API responses. Last-4 may appear in the settings HTML.

---

## Phase 1: Encrypted key table and crypto

### Overview

Add the per-user secret row, the encryption helper, prefix/last-4 rules, and an operator banner when the encryption secret is missing. No settings UI yet.

### Changes Required:

#### 1. User OpenRouter key migration

**File**: `supabase/migrations/<timestamp>_create_user_openrouter_keys.sql` (created via `npx supabase migration new create_user_openrouter_keys`)

**Intent**: Persist exactly one encrypted OpenRouter key per account, without storing plaintext.

**Contract**: Table `public.user_openrouter_keys` with `user_id` (uuid pk, `references auth.users(id) on delete cascade`), `nonce` (text not null), `ciphertext` (text not null), `last4` (text not null), `created_at` and `updated_at` (timestamptz not null default `now()`). Enable RLS. Four `authenticated` policies — SELECT / INSERT / UPDATE / DELETE — each `(select auth.uid()) = user_id` (INSERT/UPDATE also `with check`). Revoke from `anon` / `public`; grant the four ops to `authenticated`.

#### 2. Encryption env and operator banner

**Files**: `astro.config.mjs`, `.env.example`, `src/lib/config-status.ts`

**Intent**: Give the Worker a server-only wrapping key, and tell the operator when save cannot run. Stop treating the operator OpenRouter env key as “generation configured.”

**Contract**: `USER_SECRETS_KEY` is `envField.string({ context: "server", access: "secret", optional: true })`. `.env.example` documents a 64-char hex placeholder only (`###` is not valid hex — use a labeled comment or a 64-char `0` example that tests will not treat as production). Remove the OpenRouter row from `configStatuses`. Add an operator row when `USER_SECRETS_KEY` is missing (English, same Banner slot). Leave `OPENROUTER_MODEL` as-is. Stop declaring `OPENROUTER_API_KEY` in the env schema and `.env.example` so leftover `.dev.vars` lines are ignored and cannot look like a working generate config. Hosted: `npx wrangler secret put USER_SECRETS_KEY` (human gate).

#### 3. Crypto and key-shape helpers

**Files**: `src/lib/services/user-secrets.ts` (new), `src/lib/services/openrouter-key.ts` (new)

**Intent**: One module owns AES-GCM wrap/unwrap; one module owns prefix, last-4, and row mapping so settings and generate do not invent a second format.

**Contract**:

- `USER_SECRETS_KEY` is 32 raw bytes encoded as 64 hex characters. Invalid or missing material throws a mapped operator error (do not throw the raw key).
- AES-256-GCM via `crypto.subtle`. New random 12-byte IV per encrypt. Persist `nonce` and `ciphertext` as base64. Decrypt needs both.
- Prefix: trimmed string, must start with `sk-or-`, must contain no whitespace. Last-4 is the last four characters of the trimmed plaintext.
- Row mapper follows `flashcard-row.ts`: exported column list, zod snake_case schema, camelCase status DTO `{ configured: boolean; last4?: string }`. A “hint” read must not need ciphertext in the DTO.

```ts
// AES-256-GCM: 12-byte random IV stored beside ciphertext (base64).
// importKey "raw" from 32 bytes parsed out of 64 hex chars in USER_SECRETS_KEY.
```

#### 4. Shared status type

**File**: `src/types.ts`

**Intent**: Settings page, generate island, and APIs share one “has a key” shape.

**Contract**: Export `OpenRouterKeyStatus` as `{ configured: boolean; last4?: string }`. Never add the plaintext or ciphertext to `src/types.ts`.

### Success Criteria:

#### Automated Verification:

- `supabase/migrations/` contains a `create_user_openrouter_keys` migration that enables RLS and four per-operation `authenticated` policies
- `USER_SECRETS_KEY` is declared in `astro.config.mjs`; `OPENROUTER_API_KEY` is not
- Unit tests cover hex-key import, encrypt/decrypt round-trip, prefix reject (`###`, empty, interior space), and last-4
- `npm test` succeeds
- `npx astro sync` succeeds
- `npm run lint` succeeds
- `npm run build` succeeds

#### Manual Verification:

- Local apply succeeds (`npx supabase db reset` or `npx supabase migration up` against the running local stack)
- In Studio, `anon` cannot select `user_openrouter_keys`; a row inserted as user A is not visible when queried as user B

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Settings API and page

### Overview

Let a signed-in learner save, replace, and remove their key on `/settings`, with Topbar access from every signed-in surface.

### Changes Required:

#### 1. Settings service and JSON API

**Files**: `src/lib/services/openrouter-key.ts` (extend), `src/pages/api/settings/openrouter-key.ts` (new)

**Intent**: Persist and delete the key on the server so the island never holds ciphertext.

**Contract**: `export const prerender = false`. `POST` and `DELETE` only. `requireUser` first (401 `{ error: "Authentication required" }`). Missing Supabase or `USER_SECRETS_KEY` → 503, stable copy, no `code` required on the Supabase-missing path (match generate’s “Service is not configured.”). `POST` body `{ apiKey: string }` via zod using the Phase 1 prefix rule. Empty/whitespace/bad prefix → 400 `{ error, code: "invalid_key_format" }`. Success → 200 `OpenRouterKeyStatus` with `configured: true` and `last4`. Replace is upsert on `user_id` (one row). `DELETE` removes the row; 200 `{ configured: false }`. Do not return plaintext, nonce, or ciphertext. Persist `user_id` from `locals.user.id` only.

#### 2. Settings page and form island

**Files**: `src/pages/settings.astro` (new), `src/components/settings/OpenRouterKeyForm.tsx` (new)

**Intent**: One protected surface to add, replace, and remove the key, with a docs link to create an OpenRouter key.

**Contract**: SSR-load hint via the user JWT client (select `last4` only). Pass `OpenRouterKeyStatus` into a `client:load` island. Reuse `FormField` + `PasswordToggle` (type password/text). Input is always empty on load. When `configured`, show last-4, Replace, and Remove. Link to `https://openrouter.ai/keys` (and keep the existing quickstart URL if useful as secondary). Cosmic/`cn()` styling like dashboard cards. Do not read env secrets in the island.

#### 3. Nav and route guard

**Files**: `src/lib/auth.ts`, `src/components/Topbar.astro`

**Intent**: Settings is a first-class signed-in page, reachable from Dashboard, Cards, Review, and Settings itself.

**Contract**: Append `/settings` to `PROTECTED_ROUTES`. Append `{ href: "/settings", label: "Settings" }` to `productLinks`. Current-page match stays exact `pathname === link.href`.

### Success Criteria:

#### Automated Verification:

- `src/pages/api/settings/openrouter-key.ts` exports `const prerender = false`
- `/settings` is listed in `PROTECTED_ROUTES` and `productLinks`
- Tests cover 401 guest POST/DELETE, `invalid_key_format` for `###` / empty, replace updates last-4, delete clears the row, and user A’s client cannot read user B’s `last4`
- `npm test` succeeds
- `npx astro sync` succeeds
- `npm run lint` succeeds
- `npm run build` succeeds

#### Manual Verification:

- Unauthenticated `/settings` redirects to `/auth/signin?next=` for that path
- Signed-in save of a `sk-or-` key shows last-4; the input is empty after save
- `###` and whitespace-only save show a format error; no row
- Replace changes last-4; Remove leaves `configured: false`
- Signed in as user B, Settings does not show user A’s last-4

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Generate uses the user key

### Overview

Wire paste-generate to the saved key, disable Generate when none exists, and map a rejected OpenRouter key to a replace-in-Settings error.

### Changes Required:

#### 1. Generate service reads the user key

**File**: `src/lib/services/generate-cards.ts`

**Intent**: OpenRouter is billed to the learner. No env key fallback.

**Contract**: `generateCards` loads that `userId`’s row, decrypts, and uses the plaintext only as `Authorization: Bearer`. No row → `GenerateCardsError("generation_not_configured", …)` with copy that tells them to add the key in Settings (status 503). OpenRouter `401` or `403` → `GenerateCardsError("generation_invalid_key", "This OpenRouter key was rejected. Replace it in Settings.")`. Timeout and other HTTP failures stay `generation_timeout` / `generation_unavailable`. Do not read `OPENROUTER_API_KEY`. Keep `OPENROUTER_MODEL ?? DEFAULT_OPENROUTER_MODEL`. Decrypt failure (wrong wrapping key) → `generation_unavailable` (do not leak). Still do not persist paste.

#### 2. Dashboard CTA and island gate

**Files**: `src/pages/dashboard.astro`, `src/components/cards/PasteGenerate.tsx`, `src/components/cards/PasteGenerate.test.tsx`

**Intent**: The first-session generate surface does not look broken when the learner has not added a key yet.

**Contract**: Dashboard SSR-loads `OpenRouterKeyStatus` (hint only) and passes `configured` into the island. When `configured` is false: disable Generate; show a `role="status"` CTA that links to `/settings`; do not `fetch` generate. When true: existing paste/progress behavior. Island may show the server `error` string for `generation_invalid_key` the same way it shows other `!ok` errors (no empty-paste special case).

#### 3. Generate route stays the auth/paste gate

**File**: `src/pages/api/cards/generate.ts`

**Intent**: Guests and bad pastes still fail before any OpenRouter call; missing user key is a service error, not a 401.

**Contract**: Keep `requireUser`, empty/too-long paste codes, and `GenerateCardsError` forwarding. Do not accept a key in the JSON body.

### Success Criteria:

#### Automated Verification:

- `generate-cards.ts` does not import or read `OPENROUTER_API_KEY`
- `config-status.ts` has no OpenRouter row
- Tests: no user key → `generation_not_configured` and OpenRouter `fetch` is not called; OpenRouter `401` → `generation_invalid_key` and no insert; user A’s key is not used when generating as user B
- `PasteGenerate` test: `configured={false}` disables Generate and does not `fetch`
- `npm test` succeeds
- `npx astro sync` succeeds
- `npm run lint` succeeds
- `npm run build` succeeds

#### Manual Verification:

- No key: `/dashboard` Generate is disabled; Settings CTA is present; no site-wide OpenRouter banner on home or dashboard
- After save: a small paste generates cards with the six fields
- A revoked / wrong `sk-or-` key that OpenRouter rejects shows the replace-in-Settings copy
- Remove the key: Generate is disabled again
- Signed in as user B, generate does not bill or reveal user A’s key

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- Hex `USER_SECRETS_KEY` import; reject wrong length / non-hex
- Encrypt/decrypt round-trip; decrypt with a different nonce or key fails closed
- Prefix: accept `sk-or-v1-` plus payload; reject `###`, empty, `"  "`, `"sk-or- foo"`
- Last-4 of a known fixture

### Integration Tests:

- Two `@supabase/supabase-js` clients (A/B `signUp`), same pattern as the critical-path generate tests
- Mock `fetch` only for `https://openrouter.ai/api/v1/chat/completions`; pass through Supabase
- Mock `astro:env/server` (or set `USER_SECRETS_KEY` in the test env)
- Isolation: A’s `last4` / ciphertext never appear in B’s list or generate
- Do not call the live OpenRouter model

### Manual Testing Steps:

1. Local Supabase up; `.dev.vars` has `SUPABASE_*`, `USER_SECRETS_KEY` (64 hex), optional `OPENROUTER_MODEL`. No `OPENROUTER_API_KEY`.
2. Sign in as user A. `/dashboard` → Generate disabled → Settings.
3. Save a real `sk-or-` key → last-4; input empty. Dashboard Generate enabled → paste three words → cards.
4. Replace with another key (or the same) → last-4 updates if it changed.
5. Force a rejected key (or a key you revoke on OpenRouter) → generate shows replace-in-Settings copy.
6. Remove → Generate disabled.
7. Sign in as user B → Settings empty; none of A’s last-4; B cannot generate until they save their own key.
8. Guest `/settings` bounces to sign-in with `next`.

## Performance Considerations

One extra Supabase select (and in-process decrypt) before the existing OpenRouter `fetch`. Keep it sequential with the model call. No new parallel outbound waits.

## Migration Notes

New table; no backfill. Existing accounts have no key and cannot generate until they visit Settings — that is intended. Hosted project needs the migration and `wrangler secret put USER_SECRETS_KEY` before save works. Rotating `USER_SECRETS_KEY` makes every stored key unreadable; learners must paste again. Rollback locally is `supabase db reset`; hosted rollback is a down migration or drop of `public.user_openrouter_keys` only. Leftover Worker `OPENROUTER_API_KEY` secrets are unused after this change.

## References

- Roadmap S-07: `context/foundation/roadmap.md`
- S-01 generate contract: `context/changes/paste-generate-typical-use/plan.md`
- Auth / protected HTML: `src/lib/auth.ts`, `src/middleware.ts`
- OpenRouter key shape: https://openrouter.ai/docs/guides/features/guardrails/secret-formats (`sk-or-v1-` + 64 hex)
- OpenRouter auth: https://openrouter.ai/docs/api/reference/authentication
- Workers Web Crypto: https://developers.cloudflare.com/workers/runtime-apis/web-crypto/

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Encrypted key table and crypto

#### Automated

- [x] 1.1 `supabase/migrations/` contains a `create_user_openrouter_keys` migration that enables RLS and four per-operation `authenticated` policies — baf7eeb
- [x] 1.2 `USER_SECRETS_KEY` is declared in `astro.config.mjs`; `OPENROUTER_API_KEY` is not — baf7eeb
- [x] 1.3 Unit tests cover hex-key import, encrypt/decrypt round-trip, prefix reject (`###`, empty, interior space), and last-4 — baf7eeb
- [x] 1.4 `npm test` succeeds — baf7eeb
- [x] 1.5 `npx astro sync` succeeds — baf7eeb
- [x] 1.6 `npm run lint` succeeds — baf7eeb
- [x] 1.7 `npm run build` succeeds — baf7eeb

#### Manual

- [ ] 1.8 Local apply succeeds (`npx supabase db reset` or `npx supabase migration up` against the running local stack)
- [ ] 1.9 In Studio, `anon` cannot select `user_openrouter_keys`; a row inserted as user A is not visible when queried as user B

### Phase 2: Settings API and page

#### Automated

- [x] 2.1 `src/pages/api/settings/openrouter-key.ts` exports `const prerender = false` — 8daa5ab
- [x] 2.2 `/settings` is listed in `PROTECTED_ROUTES` and `productLinks` — 8daa5ab
- [x] 2.3 Tests cover 401 guest POST/DELETE, `invalid_key_format` for `###` / empty, replace updates last-4, delete clears the row, and user A’s client cannot read user B’s `last4` — 8daa5ab
- [x] 2.4 `npm test` succeeds — 8daa5ab
- [x] 2.5 `npx astro sync` succeeds — 8daa5ab
- [x] 2.6 `npm run lint` succeeds — 8daa5ab
- [x] 2.7 `npm run build` succeeds — 8daa5ab

#### Manual

- [ ] 2.8 Unauthenticated `/settings` redirects to `/auth/signin?next=` for that path
- [ ] 2.9 Signed-in save of a `sk-or-` key shows last-4; the input is empty after save
- [ ] 2.10 `###` and whitespace-only save show a format error; no row
- [ ] 2.11 Replace changes last-4; Remove leaves `configured: false`
- [ ] 2.12 Signed in as user B, Settings does not show user A’s last-4

### Phase 3: Generate uses the user key

#### Automated

- [x] 3.1 `generate-cards.ts` does not import or read `OPENROUTER_API_KEY` — 685fb95
- [x] 3.2 `config-status.ts` has no OpenRouter row — 685fb95
- [x] 3.3 Tests: no user key → `generation_not_configured` and OpenRouter `fetch` is not called; OpenRouter `401` → `generation_invalid_key` and no insert; user A’s key is not used when generating as user B — 685fb95
- [x] 3.4 `PasteGenerate` test: `configured={false}` disables Generate and does not `fetch` — 685fb95
- [x] 3.5 `npm test` succeeds — 685fb95
- [x] 3.6 `npx astro sync` succeeds — 685fb95
- [x] 3.7 `npm run lint` succeeds — 685fb95
- [x] 3.8 `npm run build` succeeds — 685fb95

#### Manual

- [ ] 3.9 No key: `/dashboard` Generate is disabled; Settings CTA is present; no site-wide OpenRouter banner on home or dashboard
- [ ] 3.10 After save: a small paste generates cards with the six fields
- [ ] 3.11 A revoked / wrong `sk-or-` key that OpenRouter rejects shows the replace-in-Settings copy
- [ ] 3.12 Remove the key: Generate is disabled again
- [ ] 3.13 Signed in as user B, generate does not bill or reveal user A’s key
