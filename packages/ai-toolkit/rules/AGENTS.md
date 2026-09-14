## 10xUsage hard rules

- Merge Tailwind classes with `cn()` from `@/lib/utils`; do not concatenate class strings.
- Do not add Next.js directives (`"use client"`). Put hooks in `src/components/hooks/`.
- API routes in `src/pages/api/` must export `const prerender = false`, use uppercase `GET`/`POST`, and validate input with zod.
- New tables live in `supabase/migrations/` as `YYYYMMDDHHmmss_short_description.sql`, with RLS on and granular per-operation, per-role policies.
- `SUPABASE_URL` and `SUPABASE_KEY` are server-only. Never read those secrets from React islands.
- Add authenticated HTML paths to `PROTECTED_ROUTES`. JSON writes use `requireUser`; never trust a client-supplied `userId`.
- Astro for static/layout; React islands only when interactivity is needed.
