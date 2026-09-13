import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { decryptSecret, encryptSecret } from "@/lib/services/user-secrets";
import type { OpenRouterKeyStatus } from "@/types";

export class OpenRouterKeyError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "OpenRouterKeyError";
    this.code = code;
    this.status = status;
  }
}

const INVALID_KEY_FORMAT_MESSAGE = "Enter an OpenRouter API key that starts with sk-or-.";

function unavailable(message: string): OpenRouterKeyError {
  return new OpenRouterKeyError("key_unavailable", message, 503);
}

export const USER_OPENROUTER_KEY_COLUMNS = "user_id, nonce, ciphertext, last4, created_at, updated_at";

export const USER_OPENROUTER_KEY_HINT_COLUMNS = "last4";

export const USER_OPENROUTER_KEY_SECRET_COLUMNS = "nonce, ciphertext";

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

export const userOpenRouterKeySecretRowSchema = z.object({
  nonce: z.string(),
  ciphertext: z.string(),
});

export type UserOpenRouterKeyRow = z.infer<typeof userOpenRouterKeyRowSchema>;
export type UserOpenRouterKeyHintRow = z.infer<typeof userOpenRouterKeyHintRowSchema>;
export type UserOpenRouterKeySecretRow = z.infer<typeof userOpenRouterKeySecretRowSchema>;

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

export async function loadOpenRouterKeyHint(
  supabase: SupabaseClient,
  userId: string,
): Promise<OpenRouterKeyStatus> {
  const { data, error } = await supabase
    .from("user_openrouter_keys")
    .select(USER_OPENROUTER_KEY_HINT_COLUMNS)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw unavailable("Could not load the API key status. Try again.");
  }

  if (!data) {
    return toOpenRouterKeyStatus(null);
  }

  const parsed = userOpenRouterKeyHintRowSchema.safeParse(data);
  if (!parsed.success) {
    throw unavailable("Could not load the API key status. Try again.");
  }

  return toOpenRouterKeyStatus(parsed.data);
}

export async function loadDecryptedOpenRouterApiKey(
  supabase: SupabaseClient,
  wrappingKey: string | undefined,
  userId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("user_openrouter_keys")
    .select(USER_OPENROUTER_KEY_SECRET_COLUMNS)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw unavailable("Could not load the API key. Try again.");
  }

  if (!data) {
    return null;
  }

  const parsed = userOpenRouterKeySecretRowSchema.safeParse(data);
  if (!parsed.success) {
    throw unavailable("Could not load the API key. Try again.");
  }

  return decryptSecret(parsed.data.nonce, parsed.data.ciphertext, wrappingKey);
}

export interface SaveOpenRouterKeyInput {
  userId: string;
  apiKey: string;
  wrappingKey: string | undefined;
  supabase: SupabaseClient;
}

export async function saveOpenRouterKey(input: SaveOpenRouterKeyInput): Promise<OpenRouterKeyStatus> {
  const parsed = parseOpenRouterApiKey(input.apiKey);
  if (!parsed.ok) {
    throw new OpenRouterKeyError("invalid_key_format", INVALID_KEY_FORMAT_MESSAGE, 400);
  }

  const sealed = await encryptSecret(parsed.apiKey, input.wrappingKey);
  const { error } = await input.supabase.from("user_openrouter_keys").upsert(
    {
      user_id: input.userId,
      nonce: sealed.nonce,
      ciphertext: sealed.ciphertext,
      last4: parsed.last4,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (error) {
    throw unavailable("Could not save the API key. Try again.");
  }

  return { configured: true, last4: parsed.last4 };
}

export interface DeleteOpenRouterKeyInput {
  userId: string;
  supabase: SupabaseClient;
}

export async function deleteOpenRouterKey(input: DeleteOpenRouterKeyInput): Promise<OpenRouterKeyStatus> {
  const { error } = await input.supabase.from("user_openrouter_keys").delete().eq("user_id", input.userId);

  if (error) {
    throw unavailable("Could not remove the API key. Try again.");
  }

  return { configured: false };
}
