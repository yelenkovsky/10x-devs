import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadPackageEnv, requireCursorApiKey } from "./load-env.ts";
import { reviewDiff } from "./review.ts";
import { resolveRepoRoot } from "./tools.ts";

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = resolveRepoRoot(PACKAGE_ROOT);
const SAMPLE_DIFF = resolve(PACKAGE_ROOT, "fixtures/sample.diff");

loadPackageEnv();

const useSample = process.argv.slice(2).includes("--sample");
const diff = useSample ? readFileSync(SAMPLE_DIFF, "utf8") : await readStdin();

if (!diff.trim()) {
  console.error("Usage: git diff | npx tsx src/index.ts\n       npx tsx src/index.ts --sample");
  process.exit(1);
}

console.error("Contacting Cursor SDK…");

const { review, metrics } = await reviewDiff(diff, {
  apiKey: requireCursorApiKey(),
  cwd: REPO_ROOT,
  model: process.env.CURSOR_MODEL,
  onEvent: (event) => {
    if (event.type === "status") {
      console.error(`[status] ${event.status}${event.message ? ` ${event.message}` : ""}`);
      return;
    }
    if (event.type === "tool_call") {
      console.error(`[tool] ${event.name}: ${event.status}`);
      return;
    }
    if (event.type === "usage") {
      console.error(`[usage] ${String(event.usage.totalTokens)} tokens this turn`);
    }
  },
});

console.error(JSON.stringify(metrics, null, 2));
console.log(JSON.stringify(review, null, 2));

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}
