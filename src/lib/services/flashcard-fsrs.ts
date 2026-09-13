import { createEmptyCard, fsrs, Rating, type Card, type CardInput } from "ts-fsrs";
import type { ReviewGrade, ReviewGradeLabels } from "@/types";

export const FSRS_COLUMNS =
  "due, last_review, stability, difficulty, elapsed_days, scheduled_days, learning_steps, reps, lapses, state";

export const FSRS_NULL_PATCH = {
  due: null,
  last_review: null,
  stability: null,
  difficulty: null,
  elapsed_days: null,
  scheduled_days: null,
  learning_steps: null,
  reps: null,
  lapses: null,
  state: null,
} as const;

const MS_PER_MINUTE = 60_000;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;

export interface FlashcardFsrsRow {
  due: string | null;
  last_review: string | null;
  stability: number | null;
  difficulty: number | null;
  elapsed_days: number | null;
  scheduled_days: number | null;
  learning_steps: number | null;
  reps: number | null;
  lapses: number | null;
  state: number | null;
}

export interface FlashcardFsrsPersist {
  due: string;
  last_review: string | null;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: number;
}

export function isEmptyScheduler(row: FlashcardFsrsRow): boolean {
  return (
    row.due === null &&
    row.last_review === null &&
    row.stability === null &&
    row.difficulty === null &&
    row.elapsed_days === null &&
    row.scheduled_days === null &&
    row.learning_steps === null &&
    row.reps === null &&
    row.lapses === null &&
    row.state === null
  );
}

export function toCardInput(row: FlashcardFsrsRow, now: Date): CardInput {
  if (isEmptyScheduler(row)) {
    return createEmptyCard(now);
  }

  if (
    row.due === null ||
    row.stability === null ||
    row.difficulty === null ||
    row.elapsed_days === null ||
    row.scheduled_days === null ||
    row.learning_steps === null ||
    row.reps === null ||
    row.lapses === null ||
    row.state === null
  ) {
    throw new Error("Incomplete FSRS state.");
  }

  return {
    due: row.due,
    last_review: row.last_review,
    stability: row.stability,
    difficulty: row.difficulty,
    elapsed_days: row.elapsed_days,
    scheduled_days: row.scheduled_days,
    learning_steps: row.learning_steps,
    reps: row.reps,
    lapses: row.lapses,
    state: row.state,
  };
}

export function toPersistPatch(card: Card): FlashcardFsrsPersist {
  return {
    due: card.due.toISOString(),
    last_review: card.last_review ? card.last_review.toISOString() : null,
    stability: card.stability,
    difficulty: card.difficulty,
    // FSRS-6 marks this deprecated; next() still returns it and we persist the Card as-is.
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
  };
}

export function previewGradeLabels(card: CardInput, now: Date): ReviewGradeLabels {
  const preview = fsrs().repeat(card, now);
  return {
    1: formatDueInterval(preview[Rating.Again].card.due, now),
    2: formatDueInterval(preview[Rating.Hard].card.due, now),
    3: formatDueInterval(preview[Rating.Good].card.due, now),
    4: formatDueInterval(preview[Rating.Easy].card.due, now),
  };
}

export function nextCard(card: CardInput, now: Date, grade: ReviewGrade): Card {
  return fsrs().next(card, now, grade).card;
}

export function formatDueInterval(due: Date, now: Date): string {
  const deltaMs = due.getTime() - now.getTime();
  if (deltaMs < MS_PER_MINUTE) {
    return "<1m";
  }

  const minutes = Math.round(deltaMs / MS_PER_MINUTE);
  if (minutes < MINUTES_PER_HOUR) {
    return `${minutes}m`;
  }

  const hours = Math.round(minutes / MINUTES_PER_HOUR);
  if (hours < HOURS_PER_DAY) {
    return `${hours}h`;
  }

  return `${Math.round(hours / HOURS_PER_DAY)}d`;
}
