import type { SupabaseClient } from "@supabase/supabase-js";
import { FLASHCARD_COLUMNS, flashcardRowSchema, toFlashcard } from "@/lib/services/flashcard-row";
import type { Flashcard } from "@/types";

function parseFlashcardRows(data: unknown): Flashcard[] {
  if (!Array.isArray(data)) {
    throw new Error("Flashcard list payload is invalid.");
  }

  const cards: Flashcard[] = [];
  for (const row of data) {
    const parsed = flashcardRowSchema.safeParse(row);
    if (parsed.success) {
      cards.push(toFlashcard(parsed.data));
    }
  }

  if (data.length > 0 && cards.length === 0) {
    throw new Error("Flashcard list payload is invalid.");
  }

  return cards;
}

export async function listFlashcards(supabase: SupabaseClient): Promise<Flashcard[]> {
  const { data, error } = await supabase
    .from("flashcards")
    .select(FLASHCARD_COLUMNS)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error("Failed to load flashcards.");
  }

  return parseFlashcardRows(data);
}
