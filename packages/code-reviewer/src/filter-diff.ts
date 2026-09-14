import type { Review } from "./review-schema.ts";

const FILE_HUNK_HEADER = /^diff --git .+$/gm;
const SKIP_HUNK =
  /packages\/code-reviewer\/fixtures\/|package-lock\.json|pnpm-lock\.yaml|yarn\.lock/;

export const FIXTURES_ONLY_REVIEW: Review = {
  implementationCorrectness: 8,
  idiomaticity: 8,
  complexity: 9,
  testRiskCoverage: 8,
  securitySafety: 8,
  verdict: "pass",
  summary:
    "The diff only touched known-bad evaluation fixtures or lockfiles. Those are not production 10xUsage code, so they do not block merge.",
};

/**
 * Drop hunks whose path is the eval/sample corpus. Inner `+diff --git` lines
 * stay attached to the fixture file hunk (they are prefixed with `+`), so a
 * `--sample` run of the fixture contents is unchanged.
 */
export function stripEvalFixtures(diff: string): string {
  const headers = [...diff.matchAll(FILE_HUNK_HEADER)];
  if (headers.length === 0) {
    return diff;
  }

  const first = headers[0];
  if (first.index === undefined) {
    return diff;
  }

  const kept: string[] = [];
  if (first.index > 0) {
    kept.push(diff.slice(0, first.index));
  }

  for (let i = 0; i < headers.length; i++) {
    const header = headers[i];
    const start = header.index;
    const next = headers[i + 1];
    if (start === undefined) {
      continue;
    }
    if (SKIP_HUNK.test(header[0])) {
      continue;
    }
    const end = next?.index ?? diff.length;
    kept.push(diff.slice(start, end));
  }

  return kept.join("").trimEnd();
}
