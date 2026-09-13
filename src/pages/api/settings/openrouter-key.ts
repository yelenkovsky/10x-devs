import type { APIRoute } from "astro";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { deleteOpenRouterKey, OpenRouterKeyError, saveOpenRouterKey } from "@/lib/services/openrouter-key";
import { UserSecretsError } from "@/lib/services/user-secrets";
import { createClient } from "@/lib/supabase";
import { getUserSecretsKey } from "@/lib/user-secrets-key";

export const prerender = false;

const saveBodySchema = z.object({
  apiKey: z.string(),
});

const INVALID_KEY_FORMAT_MESSAGE = "Enter an OpenRouter API key that starts with sk-or-.";

export const POST: APIRoute = async (context) => {
  const unauthorized = requireUser(context.locals);
  if (unauthorized || !context.locals.user) {
    return unauthorized ?? jsonResponse({ error: "Authentication required" }, 401);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return jsonResponse({ error: "Service is not configured." }, 503);
  }

  const wrappingKey = getUserSecretsKey();
  if (!wrappingKey) {
    return jsonResponse({ error: "User secrets key is not configured." }, 503);
  }

  let body: unknown;
  try {
    body = (await context.request.json()) as unknown;
  } catch {
    return jsonResponse({ error: "Invalid request body" }, 400);
  }

  const parsed = saveBodySchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse({ error: INVALID_KEY_FORMAT_MESSAGE, code: "invalid_key_format" }, 400);
  }

  try {
    const status = await saveOpenRouterKey({
      userId: context.locals.user.id,
      apiKey: parsed.data.apiKey,
      wrappingKey,
      supabase,
    });
    return jsonResponse(status, 200);
  } catch (error) {
    if (error instanceof OpenRouterKeyError) {
      return jsonResponse({ error: error.message, code: error.code }, error.status);
    }
    if (error instanceof UserSecretsError) {
      return jsonResponse({ error: error.message }, 503);
    }
    return jsonResponse({ error: "Could not save the API key. Try again." }, 503);
  }
};

export const DELETE: APIRoute = async (context) => {
  const unauthorized = requireUser(context.locals);
  if (unauthorized || !context.locals.user) {
    return unauthorized ?? jsonResponse({ error: "Authentication required" }, 401);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return jsonResponse({ error: "Service is not configured." }, 503);
  }

  try {
    const status = await deleteOpenRouterKey({
      userId: context.locals.user.id,
      supabase,
    });
    return jsonResponse(status, 200);
  } catch (error) {
    if (error instanceof OpenRouterKeyError) {
      return jsonResponse({ error: error.message, code: error.code }, error.status);
    }
    return jsonResponse({ error: "Could not remove the API key. Try again." }, 503);
  }
};

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
