import { parseUnknownReview } from "./extract-json.ts";

export default function assertReviewFails(output: unknown): {
  pass: boolean;
  score: number;
  reason: string;
} {
  try {
    const review = parseUnknownReview(output);
    const pass = review.verdict === "fail";
    return {
      pass,
      score: pass ? 1 : 0,
      reason: pass
        ? `Verdict is fail (securitySafety=${String(review.securitySafety)})`
        : `Expected verdict fail, got ${review.verdict} (securitySafety=${String(review.securitySafety)})`,
    };
  } catch (error) {
    return {
      pass: false,
      score: 0,
      reason: error instanceof Error ? error.message : "Could not parse review JSON",
    };
  }
}
