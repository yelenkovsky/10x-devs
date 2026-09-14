import { z } from "zod";

const score = (description: string) =>
  z
    .number()
    .min(1)
    .max(10)
    .describe(description);

export const REVIEW_SCHEMA = z.object({
  implementationCorrectness: score(
    "Implementation correctness on this Astro/Workers/Supabase stack (scale 1-10). 1 = broken contract or silent regression; 10 = happy path, edges, and failure modes hold.",
  ),
  idiomaticity: score(
    "Idiomatic 10xUsage (scale 1-10). 1 = fights AGENTS.md (use client, class-string concat, Next.js-isms); 10 = cn(), islands, Zod APIs, matches neighbors.",
  ),
  complexity: score(
    "Complexity (scale 1-10). 1 = accidental complexity; 10 = simplest design that fully solves the problem.",
  ),
  testRiskCoverage: score(
    "Test coverage proportional to risk (scale 1-10). 1 = risky auth/card/generation paths untested; 10 = those paths are exercised on purpose.",
  ),
  securitySafety: score(
    "Security and safety (scale 1-10). 1 = XSS, secret leak, or authz hole; 10 = validated input, server-only secrets, session-bound data.",
  ),
  verdict: z
    .enum(["pass", "fail"])
    .describe("Binding verdict. fail if any score ≤4, securitySafety ≤5, or a critical XSS/secret/authz/React-19-break defect exists."),
  summary: z
    .string()
    .describe("Markdown summary (2-3 sentences) ready to post as a PR comment. Cite files and the concrete defect."),
});

export type Review = z.infer<typeof REVIEW_SCHEMA>;
