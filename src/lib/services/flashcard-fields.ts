import { z } from "zod";

export const flashcardFieldsSchema = z.object({
  cloze: z.string().trim().min(1),
  wordPhrase: z.string().trim().min(1),
  fullSentence: z.string().trim().min(1),
  definition: z.string().trim().min(1),
  collocationPattern: z.string().trim().min(1),
  translationPl: z.string().trim().min(1),
});

export type FlashcardFields = z.infer<typeof flashcardFieldsSchema>;
