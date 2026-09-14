import { z } from "zod";
import { CRITERIA_PROMPT, VERDICT_RULES } from "./criteria.ts";
import { REVIEW_SCHEMA } from "./review-schema.ts";

export function buildSystemPrompt(withTools: boolean): string {
  const toolLine = withTools
    ? "You may call readPlan (when a change-id or plan path is apparent) and readConventions before scoring. Do not write, edit, or delete files. Do not run shell commands that change state."
    : "Do not call tools. Do not read, write, or edit files.";

  return `You are a precise, constructive code reviewer for 10xUsage — an Astro 6 SSR app with React 19 islands, Tailwind 4, Supabase cookie auth, and Cloudflare Workers.

Assess the given diff against five criteria on a scale of 1-10 (1 = serious gaps, 10 = exemplary):

${CRITERIA_PROMPT}

${VERDICT_RULES}

${toolLine}

Reply with a single JSON object and nothing else.`;
}

export function buildReviewPrompt(diff: string, options?: { withTools?: boolean }): string {
  const schema = JSON.stringify(z.toJSONSchema(REVIEW_SCHEMA), null, 2);
  return `${buildSystemPrompt(options?.withTools ?? false)}

Return JSON that matches this schema (field descriptions define the 1-10 scoring range):

${schema}

Diff:

${diff}`;
}
