# Repository Guidelines

10xUsage is an Astro 6 SSR app (React 19 islands, Tailwind 4, Supabase cookie auth, Cloudflare Workers) scaffolded from the 10x Astro starter. Follow @CLAUDE.md for the full convention set.

## Hard rules

- Merge Tailwind classes with `cn()` from `@/lib/utils`; do not concatenate class strings.
- Do not add Next.js directives (`"use client"`). Put hooks in `src/components/hooks/`.
- API routes in `src/pages/api/` must export `const prerender = false`, use uppercase `GET`/`POST`, and validate input with zod.
- New tables live in `supabase/migrations/` as `YYYYMMDDHHmmss_short_description.sql`, with RLS on and per-operation, per-role policies.
- `SUPABASE_URL` and `SUPABASE_KEY` are server-only (@astro.config.mjs `env.schema`). For `npm run dev`, copy @.env.example to `.dev.vars`. Never read those secrets from React islands.
- Add authenticated paths to `PROTECTED_ROUTES` in @src/middleware.ts (currently `/dashboard`).
- CI (@.github/workflows/ci.yml) triggers on `master`; the git default branch is `main`.

## Commands

Node 22.14.0 (@.nvmrc), npm (@package.json). `npm run dev` uses Cloudflare workerd.

CI runs `npx astro sync`, `npm run lint`, then `npm run build` with `SUPABASE_URL`/`SUPABASE_KEY` secrets. No test runner or `*.test.*` files exist.

## Layout

- `src/pages/` — routes; `src/pages/api/auth/` — signin, signup, signout; `src/pages/auth/` — auth UI
- `src/components/` — Astro for static/layout, React only for interactivity; shadcn new-york in `src/components/ui/` (`npx shadcn@latest add <name>`)
- `src/lib/` — helpers (extract to `src/lib/services/` when needed); shared DTOs in `src/types.ts`
- Auth client: @src/lib/supabase.ts. Product docs: @context/foundation/prd.md, @context/foundation/tech-stack.md

## Style and commits

Husky lint-staged runs ESLint `--fix` on `*.{ts,tsx,astro}` and Prettier on `*.{json,css,md}`.

Commit with imperative sentence-case and no Conventional Commits prefix (example: `Require email+password sign-up so cards bind to a registered user.`). Remote: `https://origin.cursor.com/yelenkovsky/10x-devs`.
