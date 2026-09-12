---
starter_id: 10x-astro-starter
package_manager: npm
project_name: 10xusage
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: true
  has_background_jobs: false
---

## Why this stack

A solo after-hours MVP in 3 weeks with email-password auth, account-bound flashcards, and AI cloze generation needs a batteries-included, agent-friendly web starter. 10x Astro Starter is the recommended default for a JavaScript/TypeScript web app: Astro + React + TypeScript + Supabase (auth + Postgres) on Cloudflare Pages. Auth and persistence come with the starter; AI generation is added on API routes because no registry starter ships an LLM first-class, with the edge runtime as a known constraint for long-running jobs. Scaffolding is first-class (registered CLI, not fully battle-tested). CI is GitHub Actions with auto-deploy on merge to main.
