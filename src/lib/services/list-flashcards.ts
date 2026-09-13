import type { SupabaseClient } from "@supabase/supabase-js";
import { FLASHCARD_COLUMNS, flashcardRowSchema, toFlashcard } from "@/lib/services/flashcard-row";
import type { BrowseFlashcardStatus, BrowseFlashcardsResult, Flashcard } from "@/types";

export const BROWSE_CARD_CAP = 1000;

export interface ListBrowseFlashcardsInput {
  supabase: SupabaseClient;
  userId: string;
  status: BrowseFlashcardStatus;
  q: string;
}

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

function escapeIlikeLiteral(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}

export async function listFlashcards(supabase: SupabaseClient): Promise<Flashcard[]> {
  const { data, error } = await supabase
    .from("flashcards")
    .select(FLASHCARD_COLUMNS)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });

  if (error) {
    throw new Error("Failed to load flashcards.");
  }

  return parseFlashcardRows(data);
}

export async function listBrowseFlashcards(input: ListBrowseFlashcardsInput): Promise<BrowseFlashcardsResult> {
  const q = input.q.trim();
  let query = input.supabase.from("flashcards").select(FLASHCARD_COLUMNS).eq("user_id", input.userId);

  if (input.status === "generated" || input.status === "kept") {
    query = query.eq("status", input.status);
  }

  if (q.length > 0) {
    query = query.ilike("word_phrase", `%${escapeIlikeLiteral(q)}%`);
  }

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(BROWSE_CARD_CAP + 1);

  if (error) {
    throw new Error("Failed to load flashcards.");
  }

  const capped = Array.isArray(data) && data.length > BROWSE_CARD_CAP;
  const rows = capped ? data.slice(0, BROWSE_CARD_CAP) : data;

  return {
    cards: parseFlashcardRows(rows),
    capped,
  };
}
