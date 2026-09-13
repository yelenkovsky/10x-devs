import type { APIRoute } from "astro";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { gradeReview, getReviewSession, ReviewSessionError } from "@/lib/services/review-session";
import { createClient } from "@/lib/supabase";

export const prerender = false;

const gradeBodySchema = z.object({
  cardId: z.uuid(),
  grade: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
});

export const GET: APIRoute = async (context) => {
  const unauthorized = requireUser(context.locals);
  if (unauthorized || !context.locals.user) {
    return unauthorized ?? jsonResponse({ error: "Authentication required" }, 401);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return jsonResponse({ error: "Service is not configured." }, 503);
  }

  try {
    const session = await getReviewSession({
      userId: context.locals.user.id,
      supabase,
      now: new Date(),
    });
    return jsonResponse(session, 200);
  } catch (error) {
    if (error instanceof ReviewSessionError) {
      return jsonResponse({ error: error.message, code: error.code }, error.status);
    }
    return jsonResponse({ error: "Could not load the review session. Try again.", code: "review_unavailable" }, 503);
  }
};

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

  const parsed = gradeBodySchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse({ error: "Invalid request body" }, 400);
  }

  try {
    const session = await gradeReview({
      userId: context.locals.user.id,
      supabase,
      now: new Date(),
      cardId: parsed.data.cardId,
      grade: parsed.data.grade,
    });
    return jsonResponse(session, 200);
  } catch (error) {
    if (error instanceof ReviewSessionError) {
      return jsonResponse({ error: error.message, code: error.code }, error.status);
    }
    return jsonResponse({ error: "Could not save the grade. Try again.", code: "review_unavailable" }, 503);
  }
};

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
