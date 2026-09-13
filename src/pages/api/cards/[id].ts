import type { APIRoute } from "astro";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { mutateFlashcard, MutateFlashcardError } from "@/lib/services/mutate-flashcard";
import { createClient } from "@/lib/supabase";

export const prerender = false;

const mutateBodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("keep") }),
  z.object({ action: z.literal("unkeep") }),
  z.object({ action: z.literal("delete") }),
  z.object({
    action: z.literal("edit"),
    cloze: z.string().trim().min(1),
    wordPhrase: z.string().trim().min(1),
    fullSentence: z.string().trim().min(1),
    definition: z.string().trim().min(1),
    collocationPattern: z.string().trim().min(1),
    translationPl: z.string().trim().min(1),
  }),
]);

export const POST: APIRoute = async (context) => {
  const unauthorized = requireUser(context.locals);
  if (unauthorized || !context.locals.user) {
    return unauthorized ?? jsonResponse({ error: "Authentication required" }, 401);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return jsonResponse({ error: "Service is not configured." }, 503);
  }

  const idParsed = z.uuid().safeParse(context.params.id);
  if (!idParsed.success) {
    return jsonResponse({ error: "Invalid card id" }, 400);
  }

  let body: unknown;
  try {
    body = (await context.request.json()) as unknown;
  } catch {
    return jsonResponse({ error: "Invalid request body" }, 400);
  }

  const parsed = mutateBodySchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse({ error: "Invalid request body" }, 400);
  }

  try {
    const result = await mutateFlashcard({
      userId: context.locals.user.id,
      id: idParsed.data,
      request: parsed.data,
      supabase,
    });
    return jsonResponse(result, 200);
  } catch (error) {
    if (error instanceof MutateFlashcardError) {
      return jsonResponse({ error: error.message, code: error.code }, error.status);
    }
    return jsonResponse({ error: "Could not change the card. Try again.", code: "card_unavailable" }, 503);
  }
};

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
