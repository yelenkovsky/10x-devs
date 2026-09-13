# User OpenRouter API Key — Plan Brief

> Full plan: `context/changes/user-openrouter-key/plan.md`
> Roadmap: `context/foundation/roadmap.md` (S-07)

## What & Why

Generate today uses one operator OpenRouter secret, so the first session is free for the learner and billed to the app. This slice lets a signed-in learner add their own OpenRouter API key and requires that key for generate, so model cost moves to the account that pastes.

## Starting Point

Paste-generate, cookie auth, and `flashcards` RLS already ship. There is no settings page and no user-owned secrets table. Missing `OPENROUTER_API_KEY` is a site-wide Polish banner plus `generation_not_configured`.

## Desired End State

The learner opens Settings, saves a `sk-or-` key, sees last-4 only, and can replace or remove it. Dashboard Generate stays disabled until a key exists. Generate calls OpenRouter with that decrypted key. Another account never sees the hint or uses the key.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Who pays for generate | User key required; env unused | Cost moves to the learner | Plan |
| Artifacts | Implementation plan + S-07 on M-1 | Roadmap stays honest | Plan |
| Second save | Replace the one row | One key per account | Plan |
| Save validation | `sk-or-` prefix; no live check | Stops `###` without a Workers call | Plan |
| Surface | `/settings` + dashboard CTA | Secret form is not mixed into paste | Plan |
| After save | Last-4 + Replace + Remove; never echo | Rotation and lockout without leaking | Plan |
| Storage | AES-GCM + last-4; user JWT + RLS | No service role; dump is not a live key | Plan |
| Failures | Drop OpenRouter banner; disable Generate; `generation_invalid_key` on 401/403 | Per-user, not operator-config copy | Plan |

## Scope

**In scope:** encrypted one-row table; Settings page/API; generate uses the user key; dashboard gate; S-07 on the roadmap.

**Out of scope:** env fallback; live save-check; multiple keys; model picker; Vault; echoing the key; auto-clear on 401; PRD rewrite; payments.

## Architecture / Approach

Settings `POST`/`DELETE` encrypts with `USER_SECRETS_KEY` and upserts `user_openrouter_keys`. Generate selects that row, decrypts on the server, and sends the plaintext only to OpenRouter. The island receives `{ configured, last4? }` only.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Encrypted key table and crypto | Table + RLS + AES-GCM + prefix/last-4 | Lost wrapping key locks every stored key |
| 2. Settings API and page | `/settings`, save/replace/remove, Topbar | Ciphertext or plaintext leaked to the island |
| 3. Generate uses the user key | User key only; dashboard CTA; invalid-key copy | First session blocked until they visit Settings |

**Prerequisites:** Local Supabase; `.dev.vars` with `SUPABASE_*` and a 64-hex `USER_SECRETS_KEY`. Hosted needs the migration and `wrangler secret put USER_SECRETS_KEY`.
**Estimated effort:** ~2–3 sessions across 3 phases.

## Open Risks & Assumptions

- PRD v1 first-session text does not mention adding a key; this plan does not edit the PRD.
- Rotating `USER_SECRETS_KEY` forces every learner to paste again.
- Owner RLS can `SELECT` ciphertext; that is acceptable only because it is AES-GCM wrapped.

## Success Criteria (Summary)

- Learner can save, replace, and remove an OpenRouter key and see last-4 only.
- Generate is disabled without a key and uses only that account’s key once saved.
- Another account cannot see the hint or generate with the first account’s key.
