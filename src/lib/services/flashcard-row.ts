import { z } from "zod";
import type { Flashcard } from "@/types";

export const FLASHCARD_COLUMNS =
  "id, user_id, generation_id, status, cloze, word_phrase, full_sentence, definition, collocation_pattern, translation_pl, created_at";

export const flashcardRowSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  generation_id: z.string(),
  status: z.enum(["generated", "kept"]),
  cloze: z.string(),
  word_phrase: z.string(),
  full_sentence: z.string(),
  definition: z.string(),
  collocation_pattern: z.string(),
  translation_pl: z.string(),
  created_at: z.string(),
});

export type FlashcardRow = z.infer<typeof flashcardRowSchema>;

export function toFlashcard(row: FlashcardRow): Flashcard {
  return {
    id: row.id,
    userId: row.user_id,
    generationId: row.generation_id,
    status: row.status,
    cloze: row.cloze,
    wordPhrase: row.word_phrase,
    fullSentence: row.full_sentence,
    definition: row.definition,
    collocationPattern: row.collocation_pattern,
    translationPl: row.translation_pl,
    createdAt: row.created_at,
  };
}
