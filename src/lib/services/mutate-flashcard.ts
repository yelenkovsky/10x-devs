import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { FSRS_NULL_PATCH } from "@/lib/services/flashcard-fsrs";
import { FLASHCARD_COLUMNS, flashcardRowSchema, toFlashcard } from "@/lib/services/flashcard-row";
import type {
  Flashcard,
  FlashcardStatus,
  MutateFlashcardCardResponse,
  MutateFlashcardDeleteResponse,
  MutateFlashcardRequest,
} from "@/types";

const editFieldsSchema = z.object({
  cloze: z.string().trim().min(1),
  wordPhrase: z.string().trim().min(1),
  fullSentence: z.string().trim().min(1),
  definition: z.string().trim().min(1),
  collocationPattern: z.string().trim().min(1),
  translationPl: z.string().trim().min(1),
});

const deletedIdSchema = z.object({
  id: z.string().min(1),
});

export class MutateFlashcardError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "MutateFlashcardError";
    this.code = code;
    this.status = status;
  }
}

function unavailable(): MutateFlashcardError {
  return new MutateFlashcardError("card_unavailable", "Could not change the card. Try again.", 503);
}

function notFound(): MutateFlashcardError {
  return new MutateFlashcardError("not_found", "Card not found.", 404);
}

export interface MutateFlashcardInput {
  userId: string;
  id: string;
  request: MutateFlashcardRequest;
  supabase: SupabaseClient;
}

export async function mutateFlashcard(
  input: MutateFlashcardInput,
): Promise<MutateFlashcardCardResponse | MutateFlashcardDeleteResponse> {
  switch (input.request.action) {
    case "keep":
      return { card: await updateOwnedCard(input, { status: "kept" }) };
    case "unkeep":
      return { card: await updateOwnedCard(input, { status: "generated", ...FSRS_NULL_PATCH }) };
    case "delete":
      return { id: await deleteOwnedCard(input) };
    case "edit": {
      const fields = editFieldsSchema.safeParse(input.request);
      if (!fields.success) {
        throw new MutateFlashcardError("invalid_fields", "All card fields are required.", 400);
      }

      return {
        card: await updateOwnedCard(input, {
          status: "kept",
          cloze: fields.data.cloze,
          word_phrase: fields.data.wordPhrase,
          full_sentence: fields.data.fullSentence,
          definition: fields.data.definition,
          collocation_pattern: fields.data.collocationPattern,
          translation_pl: fields.data.translationPl,
        }),
      };
    }
  }
}

type FlashcardUpdate = {
  status: FlashcardStatus;
  cloze?: string;
  word_phrase?: string;
  full_sentence?: string;
  definition?: string;
  collocation_pattern?: string;
  translation_pl?: string;
} & Partial<typeof FSRS_NULL_PATCH>;

async function updateOwnedCard(input: MutateFlashcardInput, patch: FlashcardUpdate): Promise<Flashcard> {
  const { data, error } = await input.supabase
    .from("flashcards")
    .update(patch)
    .eq("id", input.id)
    .eq("user_id", input.userId)
    .select(FLASHCARD_COLUMNS);

  if (error) {
    throw unavailable();
  }

  return parseReturnedRow(data);
}

async function deleteOwnedCard(input: MutateFlashcardInput): Promise<string> {
  const { data, error } = await input.supabase
    .from("flashcards")
    .delete()
    .eq("id", input.id)
    .eq("user_id", input.userId)
    .select("id");

  if (error) {
    throw unavailable();
  }

  return parseDeletedId(data);
}

function parseDeletedId(data: unknown): string {
  if (!Array.isArray(data) || data.length === 0) {
    throw notFound();
  }

  const parsed = deletedIdSchema.safeParse(data[0]);
  if (!parsed.success) {
    throw unavailable();
  }

  return parsed.data.id;
}

function parseReturnedRow(data: unknown): Flashcard {
  if (!Array.isArray(data) || data.length === 0) {
    throw notFound();
  }

  const parsed = flashcardRowSchema.safeParse(data[0]);
  if (!parsed.success) {
    throw unavailable();
  }

  return toFlashcard(parsed.data);
}
