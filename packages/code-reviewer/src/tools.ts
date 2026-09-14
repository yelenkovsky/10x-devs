import { readFile } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import type { SDKCustomTool, SDKCustomToolResult } from "@cursor/sdk";

const CHANGE_ID = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

export function createReviewTools(repoRoot: string): Record<string, SDKCustomTool> {
  const changesRoot = resolve(repoRoot, "context/changes");

  const readPlan: SDKCustomTool = {
    description:
      "Read an implementation plan from context/changes/<change-id>/plan.md. " +
      "Pass a kebab-case change-id (e.g. 'oauth-login') or a plan.md path under context/changes/. " +
      "Returns { found: false } when none exists.",
    inputSchema: {
      type: "object",
      properties: {
        target: {
          type: "string",
          description: "A change-id or a plan.md path under context/changes/.",
        },
      },
      required: ["target"],
    },
    annotations: {
      title: "Read implementation plan",
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    execute: async (args): Promise<SDKCustomToolResult> => {
      const target = typeof args.target === "string" ? args.target.trim() : "";
      const planPath = resolvePlanPath(changesRoot, target);
      if (!planPath) {
        return { found: false, reason: "invalid target" };
      }
      try {
        const contents = await readFile(planPath, "utf8");
        return {
          found: true,
          path: relative(repoRoot, planPath),
          contents,
        };
      } catch {
        return { found: false, reason: "not found" };
      }
    },
  };

  const readConventions: SDKCustomTool = {
    description:
      "Read this repository's AI coding conventions from AGENTS.md. " +
      "Call when judging idiomaticity against project rules rather than generic TypeScript style.",
    inputSchema: {
      type: "object",
      properties: {},
    },
    annotations: {
      title: "Read repo conventions",
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    execute: async (): Promise<SDKCustomToolResult> => {
      const conventionsPath = resolve(repoRoot, "AGENTS.md");
      try {
        return { found: true, path: "AGENTS.md", contents: await readFile(conventionsPath, "utf8") };
      } catch {
        return { found: false, reason: "not found" };
      }
    },
  };

  return { readPlan, readConventions };
}

export function resolveRepoRoot(packageRoot: string): string {
  return resolve(packageRoot, "..", "..");
}

function resolvePlanPath(changesRoot: string, target: string): string | null {
  if (!target) {
    return null;
  }

  let rel: string;
  if (CHANGE_ID.test(target)) {
    rel = `${target}/plan.md`;
  } else {
    const marker = "context/changes/";
    const idx = target.replaceAll("\\", "/").indexOf(marker);
    if (idx === -1 || !target.replaceAll("\\", "/").endsWith("/plan.md")) {
      return null;
    }
    rel = target.replaceAll("\\", "/").slice(idx + marker.length);
  }

  const resolved = resolve(changesRoot, rel);
  if (!isInside(changesRoot, resolved)) {
    return null;
  }
  return resolved;
}

function isInside(root: string, candidate: string): boolean {
  const normalizedRoot = resolve(root);
  const normalized = resolve(candidate);
  return normalized === normalizedRoot || normalized.startsWith(normalizedRoot + sep);
}
