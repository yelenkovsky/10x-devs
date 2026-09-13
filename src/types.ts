export type FlashcardStatus = "generated" | "kept";

export interface Flashcard {
  id: string;
  userId: string;
  generationId: string;
  status: FlashcardStatus;
  cloze: string;
  wordPhrase: string;
  fullSentence: string;
  definition: string;
  collocationPattern: string;
  translationPl: string;
  createdAt: string;
}

export interface GenerateCardsResponse {
  cards: Flashcard[];
  failedCount: number;
  truncated: boolean;
  cap: number;
}
