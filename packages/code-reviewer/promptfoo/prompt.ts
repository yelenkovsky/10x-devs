import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildReviewPrompt } from "../src/prompt.ts";

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export default function generateReviewPrompt(context: {
  vars?: { diff?: string; fixture?: string };
}): string {
  const vars = context.vars ?? {};
  const fixture = vars.fixture && !vars.fixture.includes("..") ? vars.fixture : undefined;
  const diff = fixture
    ? readFileSync(resolve(PACKAGE_ROOT, "fixtures", fixture), "utf8")
    : (vars.diff ?? "");
  // Nunjucks also renders function output; the fixture contains `{{ __html }}`.
  return `{% raw %}${buildReviewPrompt(diff, { withTools: false })}{% endraw %}`;
}
