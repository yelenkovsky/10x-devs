import { parseReview } from "./parse-review.ts";
import { buildReviewPrompt } from "./prompt.ts";
import type { ReviewMetrics, ReviewResult } from "./review.ts";

const DEFAULT_MODEL = "openai/gpt-4.1-mini";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export interface OpenRouterReviewOptions {
  apiKey: string;
  model?: string;
}

interface OpenRouterMessage {
  content?: string | null;
}

interface OpenRouterChoice {
  message?: OpenRouterMessage;
}

interface OpenRouterUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

interface OpenRouterResponse {
  id?: string;
  choices?: OpenRouterChoice[];
  usage?: OpenRouterUsage;
  error?: { message?: string };
}

export async function reviewDiffOpenRouter(
  diff: string,
  options: OpenRouterReviewOptions,
): Promise<ReviewResult> {
  const modelId = options.model?.trim() || process.env.OPENROUTER_MODEL?.trim() || DEFAULT_MODEL;
  const started = Date.now();
  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: modelId,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: buildReviewPrompt(diff, { withTools: false }) }],
    }),
  });

  const payload = (await response.json()) as OpenRouterResponse;
  if (!response.ok) {
    const detail = payload.error?.message ?? JSON.stringify(payload);
    throw new Error(`OpenRouter ${String(response.status)}: ${detail}`);
  }

  const text = payload.choices?.[0]?.message?.content?.trim();
  if (!text) {
    throw new Error("OpenRouter returned no message content");
  }

  const metrics: ReviewMetrics = {
    agentId: "openrouter",
    runId: payload.id ?? "openrouter",
    status: "finished",
    model: modelId,
    durationMs: Date.now() - started,
    inputTokens: payload.usage?.prompt_tokens,
    outputTokens: payload.usage?.completion_tokens,
    totalTokens: payload.usage?.total_tokens,
  };

  return { review: parseReview(text), metrics };
}
