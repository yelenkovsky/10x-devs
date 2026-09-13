export const FLASHCARD_FIELDS = [
  { key: "cloze", label: "Cloze", multiline: true },
  { key: "wordPhrase", label: "Word / phrase", multiline: false },
  { key: "fullSentence", label: "Full sentence", multiline: true },
  { key: "definition", label: "Definition", multiline: true },
  { key: "collocationPattern", label: "Collocation / pattern", multiline: false },
  { key: "translationPl", label: "Polish translation", multiline: false },
] as const;

export type FlashcardFieldKey = (typeof FLASHCARD_FIELDS)[number]["key"];
