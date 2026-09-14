import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { formatPrComment } from "./format-comment.ts";
import { loadPackageEnv, requireCursorApiKey, requireOpenRouterApiKey } from "./load-env.ts";
import { reviewDiffOpenRouter } from "./openrouter-review.ts";
import { reviewDiff } from "./review.ts";
import { resolveRepoRoot } from "./tools.ts";

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = resolveRepoRoot(PACKAGE_ROOT);
const SAMPLE_DIFF = resolve(PACKAGE_ROOT, "fixtures/sample.diff");

loadPackageEnv();

const args = process.argv.slice(2);
const useSample = args.includes("--sample");
const provider = resolveProvider(args);
const diff = useSample ? readFileSync(SAMPLE_DIFF, "utf8") : await readStdin();

if (!diff.trim()) {
  console.error("Usage: git diff | npx tsx src/index.ts [--openrouter]\n       npx tsx src/index.ts --sample");
  process.exit(1);
}

const promptDiff = withPullRequestContext(diff);

console.error(provider === "openrouter" ? "Contacting OpenRouter…" : "Contacting Cursor SDK…");

const { review, metrics } =
  provider === "openrouter"
    ? await reviewDiffOpenRouter(promptDiff, {
        apiKey: requireOpenRouterApiKey(),
        model: process.env.OPENROUTER_MODEL,
      })
    : await reviewDiff(promptDiff, {
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

writeGithubOutput("verdict", review.verdict);

const commentPath = process.env.REVIEW_COMMENT_PATH?.trim();
if (commentPath) {
  writeFileSync(commentPath, formatPrComment(review, metrics));
}

console.error(JSON.stringify(metrics, null, 2));
console.log(JSON.stringify(review, null, 2));

if (process.env.REVIEW_GATE === "1" && review.verdict === "fail") {
  process.exit(1);
}

function resolveProvider(argv: string[]): "openrouter" | "cursor" {
  if (argv.includes("--openrouter") || process.env.REVIEW_PROVIDER === "openrouter") {
    return "openrouter";
  }
  if (process.env.REVIEW_PROVIDER === "cursor") {
    return "cursor";
  }
  if (process.env.CI === "true" && process.env.OPENROUTER_API_KEY?.trim()) {
    return "openrouter";
  }
  return "cursor";
}

function withPullRequestContext(rawDiff: string): string {
  const title = process.env.PR_TITLE?.trim();
  const body = process.env.PR_BODY?.trim();
  const parts: string[] = [];
  if (title) {
    parts.push(`PR title: ${title}`);
  }
  if (body) {
    parts.push(`PR description:\n${body}`);
  }
  parts.push(rawDiff);
  return parts.join("\n\n");
}

function writeGithubOutput(name: string, value: string): void {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) {
    return;
  }
  appendFileSync(outputPath, `${name}=${value}\n`);
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}
