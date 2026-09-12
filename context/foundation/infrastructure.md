---
project: 10xUsage
researched_at: 2026-09-12
recommended_platform: Cloudflare Workers
runner_up: Fly.io
context_type: mvp
tech_stack:
  language: TypeScript
  framework: Astro 6 + React 19
  runtime: Cloudflare workerd (Workers)
---

## Recommendation

**Deploy on Cloudflare Workers.**

10xUsage is already an Astro 6 SSR app on `@astrojs/cloudflare` v13 and Wrangler 4 (`workerd`), with auth and Postgres on external Supabase. That stack scored a clean pass on all five agent-friendly platform criteria, is the cheapest option at MVP traffic (Free request quota; Workers Paid at $5/month if SSR CPU exceeds the Free 10 ms cap), and matches existing Cloudflare familiarity. Persistent sockets are possible through Durable Objects plus the WebSocket Hibernation API, not as a long-lived Node process — those limits are recorded in the risk register rather than treated as a reason to leave the stack.

Constraints used: persistent connections / always-on work was requested; monthly cost is the top MVP priority; Cloudflare is the familiar platform; users are single-region; an external data layer is acceptable.

## Platform Comparison

Hard filter: platforms that cannot keep a process or WebSocket alive between requests were dropped from the shortlist (Vercel, Netlify). Remaining candidates were scored Pass / Partial / Fail against CLI-first ops, managed/serverless, agent-readable docs, a stable deploy API, and MCP / first-class integration. Cost, familiarity, geography, and co-location preferences adjusted ranking, not the candidate pool (except that filter).

| Platform | CLI-first | Managed/Serverless | Agent-readable docs | Stable deploy API | MCP / Integration | Total |
|---|---|---|---|---|---|---|
| Cloudflare Workers | Pass | Pass | Pass | Pass | Pass | 5 Pass |
| Railway | Partial | Pass | Pass | Partial | Pass | 3 Pass, 2 Partial |
| Fly.io | Pass | Partial | Pass | Partial | Partial | 2 Pass, 3 Partial |
| Render | Partial | Pass | Partial | Pass | Partial | 2 Pass, 3 Partial |
| Vercel | Pass | Pass | Pass | Pass | Partial | Filtered (no always-on process; WebSockets public beta, duration-capped) |
| Netlify | Partial | Pass | Pass | Pass | Pass | Filtered (no HTTP listener / WebSockets) |

**Cloudflare Workers.** Wrangler covers deploy, rollback, secrets, and live tail. Isolates, TLS, and scaling are fully managed. Docs ship `llms.txt`, markdown, and GitHub MDX. `wrangler deploy` / `wrangler rollback` are deterministic. Official MCP servers exist for docs, bindings, builds, and observability. Soft weights: cheapest at 10k–100k requests; familiarity tie-break. Gaps vs the interview: Workers are request-scoped; always-on Node is not the model.

**Railway.** Always-on Node fits the persistent-connection answer if the adapter were swapped to `@astrojs/node`. Hosted MCP and `llms.txt` are strong. CLI has no arbitrary rollback (dashboard / GraphQL). Hobby is $5/month plus usage; a small always-on process is typically ~$5–10/month — worse than Fly when cost is the top priority.

**Fly.io.** True always-on Machines and first-class WebSockets. `flyctl` is CLI-first; rollback is “redeploy a previous image,” not a first-class rollback verb. MCP is experimental (checked 2026-09-12). Managed/serverless is only partial: you still size Machines and turn off autostop for sockets. New orgs have no ongoing free tier (sunset 2024-10-07); smallest always-on shared CPU is about $2–6/month. Cost weighting put Fly above Railway as runner-up despite a slightly weaker agent-ops matrix.

**Render.** Git-centric Web Service with paid always-on Starter at $7/month. Free instances spin down (WebSocket messages only delay spindown). CLI can create deploys and tail logs; rollback is REST/dashboard. Platform `llms.txt` was unverified (404 in this research pass). Hosted MCP exists but cannot create workers or scale. Object storage is early access/alpha; Workflows are public beta (2026-04-07).

**Vercel.** Official `@astrojs/vercel` on Fluid compute (GA). Excellent CLI and docs. Hobby is personal/non-commercial; commercial needs Pro at $20/user/month. WebSockets are public beta (2026-06-22) with Hobby maxDuration 300s. MCP is public beta (since 2025-08-04). Dropped by the persistent-connection filter.

**Netlify.** Official `@astrojs/netlify`, credit-based plans since 2025-09-04, official MCP. Sync Functions 60s; Background Functions 15 min then exit. Cannot run an HTTP listener. Dropped by the persistent-connection filter.

### Shortlisted Platforms

#### 1. Cloudflare Workers (Recommended)

Won on agent-ops score, cost, familiarity, and zero adapter swap. This repo already has the 2026-correct Workers path: `wrangler.jsonc` `main` is `@astrojs/cloudflare/entrypoints/server`, `npm run dev` runs `workerd`, Pages is not supported by the pinned adapter. Supabase stays external, which matches the co-location answer. The remaining gap is process model: use Durable Objects + Hibernation for sockets, Cron/Queues/Workflows for background work, and budget Workers Paid if SSR+AI exceeds Free CPU.

#### 2. Fly.io

Runner-up because it is the cheapest honest always-on host if Cloudflare’s isolate model proves too tight. Path would be `@astrojs/node` (`standalone`) in a Docker Machine, `HOST=0.0.0.0`, `min_machines_running = 1` (default autostop would drop sockets). Tradeoff: leave the starter’s Cloudflare adapter, pay machine-seconds even at idle, and live with experimental MCP.

#### 3. Railway

Same Node-process model as Fly with a stronger MCP and docs surface, but a higher cost floor (Hobby + always-on RAM/CPU) and dashboard-only image rollback. Kept as the third option if Fly’s Machine ops or IPv6/shared-IP quirks become the blocker and ~$5–10/month is acceptable.

## Anti-Bias Cross-Check: Cloudflare Workers

### Devil's Advocate — Weaknesses

1. Workers are request-scoped isolates, not a process that stays alive between requests. Durable Objects can hold WebSockets but they hibernate, wipe in-memory state, and every deploy disconnects all sockets. A background worker that must stay running is Cron, Queues, Workflows, or Paid Containers that still sleep when idle — not `node server.js`.
2. The Free plan’s 10 ms CPU is easy to exceed with Astro SSR plus AI cloze generation, forcing Workers Paid ($5/month) or failed requests. Paid default CPU is 30 seconds (max 5 minutes). Isolates also cap 6 concurrent outbound connections waiting for headers and 128 MB memory; overlapping LLM and Supabase calls can stall.
3. The tech-stack file still names Cloudflare Pages. `@astrojs/cloudflare` v13 removed Pages. Workers custom domains require Cloudflare nameservers; a Pages-style CNAME off-zone does not carry over.
4. `workerd` is a Node subset. Packages that assume full Node (some LLM SDKs, CJS `require`) fail at runtime even when TypeScript compiles.
5. Users are single-region. A global Worker talking to one-region Supabase can add a hop a VM next to the database would not. Smart Placement is still beta (docs as of 2026-04-23).

### Pre-Mortem — How This Could Fail

The team shipped 10xUsage on Cloudflare Workers because the starter already had Wrangler and the free tier looked like $0. They treated Durable Objects as a Node server on the edge. Live generation progress (needed so the UI does not freeze) used the standard WebSocket API instead of Hibernation, so duration billing ran for the whole connection. Every `wrangler deploy` killed in-flight generations. A spaced-repetition scheduler could not stay resident; minute Cron was laggy and burned CPU. Free 10 ms CPU tripped on SSR, they moved to Paid, then hit the six-connection cap when a generate call and Supabase overlapped. CI and internal docs still aimed at Pages, which the pinned adapter no longer supports. Custom-domain work stalled on the nameserver requirement. The three-week after-hours MVP went into runtime debugging instead of typical-use card quality.

### Unknown Unknowns

- Astro 6 + `@astrojs/cloudflare` v13 already runs `astro dev` and `astro preview` on `workerd`. A separate `wrangler pages dev` loop is the old path and is wrong for this repo.
- Environment targeting moved: you must `CLOUDFLARE_ENV=… astro build && wrangler deploy`. Building once and then `wrangler deploy --env` is the Astro 5 workflow.
- This repo’s `wrangler.jsonc` already uses `main: "@astrojs/cloudflare/entrypoints/server"`. Cloudflare’s own Astro guide still sometimes shows `dist/_worker.js/index.js` — that is pre-v13.
- Durable Objects: `ws.accept()` bills duration for the whole socket; `ctx.acceptWebSocket(ws)` hibernates. Getting that wrong is a cost surprise, not a compile error.
- Preview URLs are not generated for Workers that implement Durable Objects, and you cannot `wrangler tail` preview URLs today.
- Workers Builds Git import assumes GitHub/GitLab. A Cursor Origin-only remote will not get the same PR preview pipeline without a GitHub mirror or local `versions upload`.

## Operational Story

How this platform actually operates day to day for this repo. One concrete answer per line.

- **Preview deploys**: `npx astro build && npx wrangler versions upload` prints a unique `*-<version>.workers.dev` URL (Wrangler ≥3.74). Stable alias: `npx wrangler versions upload --preview-alias staging` (Wrangler ≥4.21; this repo pins `wrangler` ^4.90.0). Workers Builds, if connected to GitHub/GitLab, uses `npx wrangler versions upload` on non-production branches. First publish of a new Worker must be `wrangler deploy`, not `versions upload`. Preview hosts are `workers.dev` only. They are not generated if the Worker later implements Durable Objects. Logs cannot be tailed on preview URLs today. Treat previews as public unless Cloudflare Access is added. Fork PRs and Cursor Origin remotes do not get Workers Builds previews unless the repo is also on GitHub/GitLab.
- **Secrets**: Runtime secrets live in the Worker via `npx wrangler secret put SUPABASE_URL` and `npx wrangler secret put SUPABASE_KEY` (encrypted; readable by Cloudflare members with Workers edit). Local dev uses gitignored `.dev.vars` copied from `.env.example` (not React islands; `astro.config.mjs` marks both as server secrets). GitHub Actions already injects `SUPABASE_URL` / `SUPABASE_KEY` for `npm run build` only. Workers Builds has a separate build-variable store that is not runtime. Rotation is put-a-new-value; the isolate restarts. Rollback does **not** restore old secret values.
- **Rollback**: `npx wrangler rollback` sends 100% of traffic to the previous 100%-stable version; `npx wrangler rollback <VERSION_ID>` targets a specific version (`npx wrangler deployments list` / `npx wrangler versions view` to find IDs). Typical time-to-revert is seconds. Bound resources (KV, D1, R2, Durable Objects) and Supabase migrations do not roll back. If secrets changed since that version, Wrangler asks for confirmation; current secret values still apply.
- **Approval**: A human must do Cloudflare login/billing (Free → Paid), nameserver move for a custom domain, first production `wrangler login`, rotation of `SUPABASE_KEY`, and any drop of the remote Supabase project. An agent may run `npm run dev` / `npm run build`, `npx wrangler deploy`, `npx wrangler versions upload`, `npx wrangler tail`, and CI lint/build when credentials are already present.
- **Logs**: Live production/version traffic: `npx wrangler tail` (not preview URLs). Observability is already `"enabled": true` in `wrangler.jsonc`. Account-level Workers Observability MCP can query structured logs read-only. Pipeline logs for GitHub Actions are `gh run view --log` on `.github/workflows/ci.yml` (lint + build only; this research did not add deploy CI).

## Risk Register

| Risk | Source | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| Isolate model cannot run an always-on Node worker; DO hibernation wipes memory; deploys drop WebSockets | Devil's advocate / Pre-mortem | M | H | Prefer request/response + streaming for generation progress. If sockets are required, use Durable Objects with `ctx.acceptWebSocket` (Hibernation), persist state to DO storage, and reconnect clients on deploy. Put true always-on work on Fly.io instead of stretching Workers. |
| Free 10 ms CPU exceeded by SSR + AI; six outbound connections / 128 MB isolate stall generation | Devil's advocate / Pre-mortem | H | M | Measure CPU in `wrangler tail` / observability on first generate path. Budget Workers Paid ($5/month) before launch if SSR is over 10 ms. Stream the LLM; avoid parallel outbound calls that wait on headers. Keep generate handlers lean. |
| Docs and tech-stack still say Cloudflare Pages; adapter v13 cannot deploy Pages | Devil's advocate / Research finding | M | M | Deploy with `npx astro build && npx wrangler deploy` only. Do not use `wrangler pages *`. Treat `deployment_target: cloudflare-pages` in `tech-stack.md` as stale. |
| `workerd` Node subset breaks an LLM SDK or CJS package | Devil's advocate | M | H | Prove the chosen AI client under `npm run dev` (already `workerd`) before wiring production secrets. Prefer `node:` imports and `nodejs_compat` (already in `wrangler.jsonc`). |
| `wrangler deploy --env` after one build targets the wrong environment on Astro 6 | Unknown unknowns | M | M | Use `CLOUDFLARE_ENV=<name> npx astro build && npx wrangler deploy` per environment. Never reuse a single `dist/` across named Wrangler envs. |
| Custom domain requires Cloudflare nameservers | Devil's advocate / Research finding | M | M | Plan DNS cutover before promising a custom hostname. `workers.dev` is enough for MVP. |
| `ws.accept()` bills DO duration for the whole connection | Unknown unknowns | M | M | Only accept sockets via `ctx.acceptWebSocket`. Review DO duration in the dashboard after the first socket feature. |
| Preview URLs vanish once Durable Objects are added; previews cannot be tailed | Unknown unknowns | M | L | Keep generate/review on HTTP until previews matter. Tail production/staging versions that are real deployments, not preview URLs. |
| Workers Builds will not see a Cursor Origin-only remote | Unknown unknowns | M | L | Deploy from the laptop with Wrangler for MVP, or mirror to GitHub/GitLab before enabling Workers Builds. |
| Global Worker → single-region Supabase extra hop; Smart Placement still beta | Devil's advocate | L | L | Keep MVP on default placement. If Poland-to-US latency shows up in generate/review, pin via Hyperdrive (GA) or move Supabase closer; do not depend on Smart Placement. |

## Getting Started

Pinned in this repo: Astro `^6.3.1`, `@astrojs/cloudflare` `^13.5.0`, `wrangler` `^4.90.0`, `wrangler.jsonc` already set to `@astrojs/cloudflare/entrypoints/server`. Do **not** run `wrangler init`, `npx astro add cloudflare`, or install Wrangler globally.

1. Log in with the project CLI: `npx wrangler login`.
2. Copy `.env.example` to `.dev.vars` and fill `SUPABASE_URL` and `SUPABASE_KEY`. `.dev.vars` is the local Workers secret file; keep it gitignored.
3. Run `npm run dev`. Astro 6 + adapter v13 already boots `workerd` — this is the production-fidelity loop. Do not add `wrangler pages dev`. Use `npx astro build && npx wrangler dev` only if you need to preview the built Worker bundle.
4. Set production secrets (once per Worker): `npx wrangler secret put SUPABASE_URL` then `npx wrangler secret put SUPABASE_KEY`.
5. First production publish: `npx astro build && npx wrangler deploy`. Later previews: `npx astro build && npx wrangler versions upload`. Rollback: `npx wrangler rollback`. Live logs: `npx wrangler tail`.

## Out of Scope

The following were not evaluated in this research:

- Docker image configuration
- CI/CD pipeline setup (GitHub Actions currently lints and builds only)
- Production-scale architecture (multi-region, HA, DR)
