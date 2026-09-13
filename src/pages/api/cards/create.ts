import type { APIRoute } from "astro";
import { requireUser } from "@/lib/auth";
import { createFlashcard, CreateFlashcardError } from "@/lib/services/create-flashcard";
import { flashcardFieldsSchema } from "@/lib/services/flashcard-fields";
import { createClient } from "@/lib/supabase";

export const prerender = false;

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

  const parsed = flashcardFieldsSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse({ error: "All card fields are required.", code: "invalid_fields" }, 400);
  }

  try {
    const result = await createFlashcard({
      userId: context.locals.user.id,
      fields: parsed.data,
      supabase,
    });
    return jsonResponse(result, 200);
  } catch (error) {
    if (error instanceof CreateFlashcardError) {
      return jsonResponse({ error: error.message, code: error.code }, error.status);
    }
    return jsonResponse({ error: "Could not create the card. Try again.", code: "card_unavailable" }, 503);
  }
};

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
