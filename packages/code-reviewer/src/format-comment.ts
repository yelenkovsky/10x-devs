import type { Review } from "./review-schema.ts";
import type { ReviewMetrics } from "./review.ts";

const SCORE_ROWS: Array<[keyof Review, string]> = [
  ["implementationCorrectness", "Implementation correctness"],
  ["idiomaticity", "Idiomatic 10xUsage"],
  ["complexity", "Complexity"],
  ["testRiskCoverage", "Test / risk coverage"],
  ["securitySafety", "Security and safety"],
];

export function formatPrComment(review: Review, metrics: ReviewMetrics): string {
  const badge = review.verdict === "pass" ? "passed" : "failed";
  const rows = SCORE_ROWS.map(([key, label]) => `| ${label} | ${String(review[key])} |`).join("\n");
  const model = metrics.model ?? "unknown model";
  return `## AI code review — **${badge}**

| Criterion | Score (1–10) |
|---|---|
${rows}

${review.summary}

---
_10xUsage reviewer · \`${model}\` · verdict \`${review.verdict}\`_
`;
}
