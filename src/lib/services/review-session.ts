import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { CardInput } from "ts-fsrs";
import { FSRS_COLUMNS, nextCard, previewGradeLabels, toCardInput, toPersistPatch } from "@/lib/services/flashcard-fsrs";
import type { ReviewCard, ReviewGrade, ReviewSessionPayload } from "@/types";

const REVIEW_CONTENT_COLUMNS = "id, cloze, word_phrase, full_sentence, definition, collocation_pattern, translation_pl";

const REVIEW_LOAD_COLUMNS = `${REVIEW_CONTENT_COLUMNS}, ${FSRS_COLUMNS}`;

const reviewRowSchema = z.object({
  id: z.string(),
  cloze: z.string(),
  word_phrase: z.string(),
  full_sentence: z.string(),
  definition: z.string(),
  collocation_pattern: z.string(),
  translation_pl: z.string(),
  due: z.string().nullable(),
  last_review: z.string().nullable(),
  stability: z.number().nullable(),
  difficulty: z.number().nullable(),
  elapsed_days: z.number().int().nullable(),
  scheduled_days: z.number().int().nullable(),
  learning_steps: z.number().int().nullable(),
  reps: z.number().int().nullable(),
  lapses: z.number().int().nullable(),
  state: z.number().int().nullable(),
});

type ReviewRow = z.infer<typeof reviewRowSchema>;

export class ReviewSessionError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "ReviewSessionError";
    this.code = code;
    this.status = status;
  }
}

export interface ReviewSessionInput {
  userId: string;
  supabase: SupabaseClient;
  now: Date;
}

export interface GradeReviewInput extends ReviewSessionInput {
  cardId: string;
  grade: ReviewGrade;
}

function unavailable(): ReviewSessionError {
  return new ReviewSessionError("review_unavailable", "Could not load the review session. Try again.", 503);
}

function gradeUnavailable(): ReviewSessionError {
  return new ReviewSessionError("review_unavailable", "Could not save the grade. Try again.", 503);
}

function notFound(): ReviewSessionError {
  return new ReviewSessionError("not_found", "Card not found.", 404);
}

export async function getReviewSession(input: ReviewSessionInput): Promise<ReviewSessionPayload> {
  const remaining = await countDueQueue(input);
  if (remaining === 0) {
    const keptCount = await countKept(input);
    return {
      card: null,
      remaining: 0,
      emptyReason: keptCount === 0 ? "no_kept" : "none_due",
    };
  }

  const row = await loadNextDueRow(input);
  return sessionFromRow(row, remaining, input.now);
}

export async function gradeReview(input: GradeReviewInput): Promise<ReviewSessionPayload> {
  const row = await loadQueueRow(input, input.cardId);
  let cardInput: CardInput;
  try {
    cardInput = toCardInput(row, input.now);
  } catch {
    throw gradeUnavailable();
  }

  const persist = toPersistPatch(nextCard(cardInput, input.now, input.grade));
  const { data, error } = await input.supabase
    .from("flashcards")
    .update(persist)
    .eq("id", input.cardId)
    .eq("user_id", input.userId)
    .select(REVIEW_LOAD_COLUMNS);

  if (error) {
    throw gradeUnavailable();
  }
  if (!Array.isArray(data) || data.length === 0) {
    throw notFound();
  }

  return getReviewSession(input);
}

async function countDueQueue(input: ReviewSessionInput): Promise<number> {
  const { count, error } = await input.supabase
    .from("flashcards")
    .select("id", { count: "exact", head: true })
    .eq("user_id", input.userId)
    .eq("status", "kept")
    .or(`due.is.null,due.lte.${input.now.toISOString()}`);

  if (error || count === null) {
    throw unavailable();
  }

  return count;
}

async function countKept(input: ReviewSessionInput): Promise<number> {
  const { count, error } = await input.supabase
    .from("flashcards")
    .select("id", { count: "exact", head: true })
    .eq("user_id", input.userId)
    .eq("status", "kept");

  if (error || count === null) {
    throw unavailable();
  }

  return count;
}

async function loadNextDueRow(input: ReviewSessionInput): Promise<ReviewRow> {
  const { data, error } = await input.supabase
    .from("flashcards")
    .select(REVIEW_LOAD_COLUMNS)
    .eq("user_id", input.userId)
    .eq("status", "kept")
    .or(`due.is.null,due.lte.${input.now.toISOString()}`)
    .order("due", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(1);

  if (error) {
    throw unavailable();
  }

  return parseReviewRow(data);
}

async function loadQueueRow(input: ReviewSessionInput, cardId: string): Promise<ReviewRow> {
  const { data, error } = await input.supabase
    .from("flashcards")
    .select(REVIEW_LOAD_COLUMNS)
    .eq("id", cardId)
    .eq("user_id", input.userId)
    .eq("status", "kept")
    .or(`due.is.null,due.lte.${input.now.toISOString()}`);

  if (error) {
    throw gradeUnavailable();
  }

  return parseReviewRow(data, { missing: "not_found" });
}

function parseReviewRow(data: unknown, options?: { missing: "not_found" }): ReviewRow {
  if (!Array.isArray(data) || data.length === 0) {
    throw options?.missing === "not_found" ? notFound() : unavailable();
  }

  const parsed = reviewRowSchema.safeParse(data[0]);
  if (!parsed.success) {
    throw options?.missing === "not_found" ? gradeUnavailable() : unavailable();
  }

  return parsed.data;
}

function sessionFromRow(row: ReviewRow, remaining: number, now: Date): ReviewSessionPayload {
  let cardInput: CardInput;
  try {
    cardInput = toCardInput(row, now);
  } catch {
    throw unavailable();
  }

  return {
    card: toReviewCard(row),
    remaining,
    grades: previewGradeLabels(cardInput, now),
  };
}

function toReviewCard(row: ReviewRow): ReviewCard {
  return {
    id: row.id,
    cloze: row.cloze,
    wordPhrase: row.word_phrase,
    fullSentence: row.full_sentence,
    definition: row.definition,
    collocationPattern: row.collocation_pattern,
    translationPl: row.translation_pl,
  };
}
