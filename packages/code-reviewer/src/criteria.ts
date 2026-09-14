export const CRITERION_IDS = [
  "implementationCorrectness",
  "idiomaticity",
  "complexity",
  "testRiskCoverage",
  "securitySafety",
] as const;

export type CriterionId = (typeof CRITERION_IDS)[number];

export interface Criterion {
  id: CriterionId;
  title: string;
  prompt: string;
}

/**
 * Five acceptance criteria for this repo (Astro 6 SSR, React 19 islands,
 * Tailwind 4, Supabase cookie auth, Cloudflare Workers). Generic language
 * fluency is not enough — a PR has to match the rules already in AGENTS.md,
 * API routes, and the PRD (cards never leak across accounts).
 */
export const CRITERIA: readonly Criterion[] = [
  {
    id: "implementationCorrectness",
    title: "Implementation correctness",
    prompt: `1) **implementationCorrectness** — does the change actually do what it claims on this stack?
   - _1_: broken logic, wrong HTTP/prerender contract, missed error paths, or a silent regression (e.g. API route with \`prerender: true\`, lowercase handlers, body used unparsed, client-supplied \`userId\` instead of \`locals.user.id\`; React 19-incompatible APIs used as if they still worked: function-component \`defaultProps\`, \`findDOMNode\`, \`ReactDOM.render\`).
   - _10_: happy path, edges, and failure modes work; Astro handlers are uppercase \`GET\`/\`POST\` with \`prerender = false\`; React 19 APIs only; responses match the declared content type.`,
  },
  {
    id: "idiomaticity",
    title: "Idiomatic 10xUsage",
    prompt: `2) **idiomaticity** — would this pass as native code in this repository?
   - _1_: fights the stack: \`"use client"\`, concatenated Tailwind strings, hooks living outside \`src/components/hooks/\`, business logic jammed in a page, Next.js-isms.
   - _10_: Astro for static/layout, React islands only for interactivity, \`cn()\` from \`@/lib/utils\`, Zod at API boundaries, services under \`src/lib/services/\`, shadcn new-york patterns, matches neighboring files.`,
  },
  {
    id: "complexity",
    title: "Complexity",
    prompt: `3) **complexity** — is this the simplest design that solves the problem?
   - _1_: accidental complexity, speculative abstractions, or a tangle that hides intent.
   - _10_: minimal and readable; no extra layers beyond what this change needs.`,
  },
  {
    id: "testRiskCoverage",
    title: "Test / risk coverage",
    prompt: `4) **testRiskCoverage** — are risky paths tested in proportion to blast radius?
   - _1_: auth, card writes, generation, or SRS review ship untested; tests are TODOs or assert nothing.
   - _10_: vitest (and UI tests where the island is non-trivial) covers the paths that can leak another user's cards, drop a deck, or fail generation silently.`,
  },
  {
    id: "securitySafety",
    title: "Security and safety",
    prompt: `5) **securitySafety** — secrets, authz, XSS, and untrusted input.
   - _1_: secret in a React island or query string; XSS (\`dangerouslySetInnerHTML\` / unsanitized HTML); missing \`requireUser\`; RLS bypass; client-chosen \`user_id\`.
   - _10_: server-only \`SUPABASE_*\`; session user is the only owner key; Zod validation; no new HTML injection; Workers-safe handling of untrusted paste/input.`,
  },
];

export const CRITERIA_PROMPT = CRITERIA.map((criterion) => criterion.prompt).join("\n\n");

export const VERDICT_RULES = `Score each criterion from 1 to 10 (integers preferred). Then issue a binding verdict for the whole change:
- **fail** if any score is ≤ 4, if securitySafety is ≤ 5, or if the diff introduces XSS, secret leakage, broken authz, or a React 19-incompatible API used as if it still worked.
- **pass** only when the change is safe to merge against these criteria.

Include a Markdown summary (2–3 sentences) the PR author can act on. Mention file paths and the concrete defect, not generalities.`;
