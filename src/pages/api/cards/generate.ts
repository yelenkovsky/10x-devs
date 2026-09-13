import type { APIRoute } from "astro";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { generateCards, GenerateCardsError } from "@/lib/services/generate-cards";
import { createClient } from "@/lib/supabase";

export const prerender = false;

const MAX_PASTE_LENGTH = 4000;

const generateBodySchema = z.object({
  paste: z.string(),
});

export const POST: APIRoute = async (context) => {
  const unauthorized = requireUser(context.locals);
  if (unauthorized || !context.locals.user) {
    return unauthorized ?? jsonResponse({ error: "Authentication required" }, 401);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return jsonResponse({ error: "Service is not configured." }, 503);
  }

  let body: unknown;
  try {
    body = (await context.request.json()) as unknown;
  } catch {
    return jsonResponse({ error: "Invalid request body" }, 400);
  }

  const parsed = generateBodySchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse({ error: "Invalid request body" }, 400);
  }

  const paste = parsed.data.paste.trim();
  if (paste === "") {
    return jsonResponse({ error: "Paste is empty.", code: "empty_paste" }, 400);
  }
  if (paste.length > MAX_PASTE_LENGTH) {
    return jsonResponse({ error: "Paste is too long.", code: "paste_too_long", max: MAX_PASTE_LENGTH }, 400);
  }

  try {
    const result = await generateCards({
      userId: context.locals.user.id,
      paste,
      origin: context.url.origin,
      supabase,
    });
    return jsonResponse(result, 200);
  } catch (error) {
    if (error instanceof GenerateCardsError) {
      return jsonResponse({ error: error.message, code: error.code }, error.status);
    }
    return jsonResponse(
      { error: "Generation is temporarily unavailable. Try again.", code: "generation_unavailable" },
      503,
    );
  }
};

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
