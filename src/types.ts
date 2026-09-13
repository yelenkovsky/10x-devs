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

export type MutateFlashcardRequest =
  | { action: "keep" }
  | { action: "unkeep" }
  | { action: "delete" }
  | {
      action: "edit";
      cloze: string;
      wordPhrase: string;
      fullSentence: string;
      definition: string;
      collocationPattern: string;
      translationPl: string;
    };

export interface MutateFlashcardCardResponse {
  card: Flashcard;
}

export interface MutateFlashcardDeleteResponse {
  id: string;
}

export type ReviewGrade = 1 | 2 | 3 | 4;

export type ReviewEmptyReason = "no_kept" | "none_due";

export interface ReviewCard {
  id: string;
  cloze: string;
  wordPhrase: string;
  fullSentence: string;
  definition: string;
  collocationPattern: string;
  translationPl: string;
}

export interface GradeReviewRequest {
  cardId: string;
  grade: ReviewGrade;
}

export interface ReviewGradeLabels {
  1: string;
  2: string;
  3: string;
  4: string;
}

export interface ReviewSessionPayload {
  card: ReviewCard | null;
  remaining: number;
  emptyReason?: ReviewEmptyReason;
  grades?: ReviewGradeLabels;
}
