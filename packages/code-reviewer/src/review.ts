import { Agent, CursorAgentError, type SDKMessage } from "@cursor/sdk";
import { parseReview } from "./parse-review.ts";
import { buildReviewPrompt } from "./prompt.ts";
import type { Review } from "./review-schema.ts";
import { createReviewTools } from "./tools.ts";

export interface ReviewMetrics {
  agentId: string;
  runId: string;
  requestId?: string;
  status: string;
  model?: string;
  durationMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  chargedUsd?: number;
}

export interface ReviewResult {
  review: Review;
  metrics: ReviewMetrics;
}

export interface ReviewDiffOptions {
  apiKey: string;
  cwd: string;
  model?: string;
  withTools?: boolean;
  onEvent?: (event: SDKMessage) => void;
}

const DEFAULT_MODEL = "composer-2.5";

export async function reviewDiff(diff: string, options: ReviewDiffOptions): Promise<ReviewResult> {
  const modelId = options.model?.trim() || DEFAULT_MODEL;
  const withTools = options.withTools ?? true;

  try {
    await using agent = await Agent.create({
      apiKey: options.apiKey,
      model: { id: modelId },
      local: {
        cwd: options.cwd,
        settingSources: [],
        autoReview: true,
        customTools: withTools ? createReviewTools(options.cwd) : undefined,
      },
    });

    const run = await agent.send(buildReviewPrompt(diff, { withTools }));
    if (options.onEvent) {
      for await (const event of run.stream()) {
        options.onEvent(event);
      }
    }

    const result = await run.wait();
    if (result.status !== "finished") {
      const detail = result.error?.message ?? result.status;
      throw new Error(`Review failed (${result.status}): ${detail}`);
    }

    const text = result.result?.trim();
    if (!text) {
      throw new Error("The agent returned no result");
    }

    let chargedUsd: number | undefined;
    try {
      const billed = await agent.getUsage({ runId: run.id });
      if (billed.cost) {
        chargedUsd = billed.cost.chargedCents / 100;
      }
    } catch {
      chargedUsd = undefined;
    }

    return {
      review: parseReview(text),
      metrics: {
        agentId: agent.agentId,
        runId: run.id,
        requestId: result.requestId,
        status: result.status,
        model: result.model?.id ?? modelId,
        durationMs: result.durationMs,
        inputTokens: result.usage?.inputTokens,
        outputTokens: result.usage?.outputTokens,
        totalTokens: result.usage?.totalTokens,
        chargedUsd,
      },
    };
  } catch (err) {
    if (err instanceof CursorAgentError) {
      throw new Error(`Cursor SDK startup failed: ${err.message} (retryable=${String(err.isRetryable)})`);
    }
    throw err;
  }
}
