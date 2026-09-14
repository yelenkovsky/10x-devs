import { parseReview } from "../src/parse-review.ts";
import { REVIEW_SCHEMA, type Review } from "../src/review-schema.ts";

export default function extractReviewJson(output: unknown): string {
  return JSON.stringify(parseUnknownReview(output));
}

export function parseUnknownReview(output: unknown): Review {
  if (output && typeof output === "object" && "verdict" in output) {
    return REVIEW_SCHEMA.parse(output);
  }
  return parseReview(String(output ?? ""));
}
