import { z } from "zod";
import type { OpenRouterKeyStatus } from "@/types";

export const USER_OPENROUTER_KEY_COLUMNS = "user_id, nonce, ciphertext, last4, created_at, updated_at";

export const USER_OPENROUTER_KEY_HINT_COLUMNS = "last4";

export const userOpenRouterKeyRowSchema = z.object({
  user_id: z.string(),
  nonce: z.string(),
  ciphertext: z.string(),
  last4: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const userOpenRouterKeyHintRowSchema = z.object({
  last4: z.string(),
});

export type UserOpenRouterKeyRow = z.infer<typeof userOpenRouterKeyRowSchema>;
export type UserOpenRouterKeyHintRow = z.infer<typeof userOpenRouterKeyHintRowSchema>;

const OPENROUTER_KEY_PREFIX = "sk-or-";

export function openRouterKeyLast4(apiKey: string): string {
  return apiKey.slice(-4);
}

export function parseOpenRouterApiKey(value: string): { ok: true; apiKey: string; last4: string } | { ok: false } {
  const trimmed = value.trim();
  if (!trimmed.startsWith(OPENROUTER_KEY_PREFIX) || /\s/.test(trimmed)) {
    return { ok: false };
  }
  return { ok: true, apiKey: trimmed, last4: openRouterKeyLast4(trimmed) };
}

export function toOpenRouterKeyStatus(row: UserOpenRouterKeyHintRow | null | undefined): OpenRouterKeyStatus {
  if (!row) {
    return { configured: false };
  }
  return { configured: true, last4: row.last4 };
}
