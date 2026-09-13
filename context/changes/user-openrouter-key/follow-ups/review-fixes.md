# Follow-up: Settings save reports wrapping key missing

Related change: `user-openrouter-key` (still open). Commit: `3a1e0e2`.

## Observation

On Settings, pasting a real `sk-or-` key returned “User secrets key is not configured.”

## What was going on

Not the OpenRouter key. Three local conditions stacked:

1. `.dev.vars` had no 64-hex `USER_SECRETS_KEY` (leftover `OPENROUTER_API_KEY` only).
2. Local `user_openrouter_keys` migration was not applied.
3. After the wrapping key was added, `astro:env/server` in `astro dev` (workerd) still did not see Wrangler `.dev.vars` — Vite’s snapshot reads `.env*`.

## What landed (`3a1e0e2`)

- `getUserSecretsKey()` — `astro:env/server` first, else `cloudflare:workers` `env.USER_SECRETS_KEY`. Used by Settings `POST` and generate decrypt.
- `astro.config.mjs` copies unset `.dev.vars` keys into `process.env`.
- Config-status / banner evaluated per request via that helper.
- Vitest aliases `cloudflare:workers` to `src/test/cloudflare-workers-stub.ts`.

Local table: `npx supabase migration up --local` applied `20260913222052_create_user_openrouter_keys.sql`.

Hosted still needs `npx wrangler secret put USER_SECRETS_KEY`.
