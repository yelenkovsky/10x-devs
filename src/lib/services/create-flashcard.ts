import type { SupabaseClient } from "@supabase/supabase-js";
import { flashcardFieldsSchema } from "@/lib/services/flashcard-fields";
import { FLASHCARD_COLUMNS, flashcardRowSchema, toFlashcard } from "@/lib/services/flashcard-row";
import type { CreateFlashcardRequest, CreateFlashcardResponse } from "@/types";

export class CreateFlashcardError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "CreateFlashcardError";
    this.code = code;
    this.status = status;
  }
}

function unavailable(): CreateFlashcardError {
  return new CreateFlashcardError("card_unavailable", "Could not create the card. Try again.", 503);
}

export interface CreateFlashcardInput {
  userId: string;
  fields: CreateFlashcardRequest;
  supabase: SupabaseClient;
}

export async function createFlashcard(input: CreateFlashcardInput): Promise<CreateFlashcardResponse> {
  const fields = flashcardFieldsSchema.safeParse(input.fields);
  if (!fields.success) {
    throw new CreateFlashcardError("invalid_fields", "All card fields are required.", 400);
  }

  const { data, error } = await input.supabase
    .from("flashcards")
    .insert({
      user_id: input.userId,
      generation_id: crypto.randomUUID(),
      status: "kept" as const,
      cloze: fields.data.cloze,
      word_phrase: fields.data.wordPhrase,
      full_sentence: fields.data.fullSentence,
      definition: fields.data.definition,
      collocation_pattern: fields.data.collocationPattern,
      translation_pl: fields.data.translationPl,
    })
    .select(FLASHCARD_COLUMNS);

  if (error) {
    throw unavailable();
  }

  if (!Array.isArray(data) || data.length === 0) {
    throw unavailable();
  }

  const parsed = flashcardRowSchema.safeParse(data[0]);
  if (!parsed.success) {
    throw unavailable();
  }

  return { card: toFlashcard(parsed.data) };
}
