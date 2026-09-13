import type { SupabaseClient } from "@supabase/supabase-js";
import { OPENROUTER_MODEL } from "astro:env/server";
import { z } from "zod";
import { flashcardFieldsSchema, type FlashcardFields } from "@/lib/services/flashcard-fields";
import { FLASHCARD_COLUMNS, flashcardRowSchema, toFlashcard } from "@/lib/services/flashcard-row";
import type { Flashcard, GenerateCardsResponse } from "@/types";

export const CARD_CAP = 15;
export const DEFAULT_OPENROUTER_MODEL = "openai/gpt-4o-mini";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const GENERATE_TIMEOUT_MS = 55_000;

const SYSTEM_PROMPT = `You create English cloze flashcards for adult self-learners.

Teach typical everyday use: natural context, a useful collocation, and a grammar pattern. Do not write literary, rare, or C1/C2 showpiece sentences.

Each card must include:
- cloze: one English sentence with _____ replacing the target word or phrase
- wordPhrase: the gapped word or phrase
- fullSentence: the same sentence with the gap filled
- definition: a short everyday English definition of the target
- collocationPattern: the collocation or grammar pattern the sentence teaches
- translationPl: a natural Polish translation of the full sentence

One card per target item. If the input is a list, each list item is a target. If the input is prose, extract the useful target words or phrases. If there are more than 15 items, use the first 15 in input order. Return at most 15 cards.`;

const cardsEnvelopeSchema = z.object({
  cards: z.array(z.unknown()),
});

const openRouterResponseSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({
          content: z.string(),
        }),
      }),
    )
    .min(1),
});

const cardJsonSchema = {
  type: "object",
  properties: {
    cards: {
      type: "array",
      items: {
        type: "object",
        properties: {
          cloze: {
            type: "string",
            description: "English sentence with _____ in place of the target word or phrase",
          },
          wordPhrase: {
            type: "string",
            description: "The gapped word or phrase",
          },
          fullSentence: {
            type: "string",
            description: "The cloze sentence with the gap filled",
          },
          definition: {
            type: "string",
            description: "Short everyday English definition of the target",
          },
          collocationPattern: {
            type: "string",
            description: "Collocation or grammar pattern the sentence teaches",
          },
          translationPl: {
            type: "string",
            description: "Natural Polish translation of the full sentence",
          },
        },
        required: ["cloze", "wordPhrase", "fullSentence", "definition", "collocationPattern", "translationPl"],
        additionalProperties: false,
      },
    },
  },
  required: ["cards"],
  additionalProperties: false,
};

export class GenerateCardsError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(code: string, message: string, status = 503) {
    super(message);
    this.name = "GenerateCardsError";
    this.code = code;
    this.status = status;
  }
}

function unavailable(): GenerateCardsError {
  return new GenerateCardsError("generation_unavailable", "Generation is temporarily unavailable. Try again.");
}

export interface GenerateCardsInput {
  userId: string;
  paste: string;
  origin: string;
  supabase: SupabaseClient;
}

function resolveGenerateApiKey(): string | undefined {
  // Operator OPENROUTER_API_KEY was removed in Phase 1. User-key decrypt lands in Phase 3.
  return undefined;
}

export async function generateCards(input: GenerateCardsInput): Promise<GenerateCardsResponse> {
  const apiKey = resolveGenerateApiKey();
  if (!apiKey) {
    throw new GenerateCardsError("generation_not_configured", "Generation is not configured.");
  }

  const content = await requestOpenRouterCards(input.paste, input.origin, apiKey);
  const envelope = cardsEnvelopeSchema.safeParse(parseJsonContent(content));
  if (!envelope.success) {
    throw unavailable();
  }

  const truncated = envelope.data.cards.length >= CARD_CAP;
  const candidates = envelope.data.cards.slice(0, CARD_CAP);

  const validCards: FlashcardFields[] = [];
  let failedCount = 0;
  for (const candidate of candidates) {
    const parsed = flashcardFieldsSchema.safeParse(candidate);
    if (parsed.success) {
      validCards.push(parsed.data);
    } else {
      failedCount += 1;
    }
  }

  const cards = await persistValidCards(input.supabase, input.userId, validCards);
  return { cards, failedCount, truncated, cap: CARD_CAP };
}

async function requestOpenRouterCards(paste: string, origin: string, apiKey: string): Promise<string> {
  const model = OPENROUTER_MODEL ?? DEFAULT_OPENROUTER_MODEL;
  let response: Response;

  try {
    response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": origin,
        "X-Title": "10xUsage",
        "X-OpenRouter-Title": "10xUsage",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: paste },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "flashcards",
            strict: true,
            schema: cardJsonSchema,
          },
        },
        provider: { require_parameters: true },
        max_tokens: 4096,
        temperature: 0.3,
      }),
      signal: AbortSignal.timeout(GENERATE_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new GenerateCardsError("generation_timeout", "Generation timed out. Try again.");
    }
    throw unavailable();
  }

  if (!response.ok) {
    throw unavailable();
  }

  let payload: unknown;
  try {
    payload = (await response.json()) as unknown;
  } catch {
    throw unavailable();
  }

  const parsed = openRouterResponseSchema.safeParse(payload);
  const content = parsed.success ? parsed.data.choices[0]?.message.content : undefined;
  if (!content) {
    throw unavailable();
  }

  return content;
}

function parseJsonContent(content: string): unknown {
  try {
    return JSON.parse(content) as unknown;
  } catch {
    throw unavailable();
  }
}

async function persistValidCards(
  supabase: SupabaseClient,
  userId: string,
  validCards: FlashcardFields[],
): Promise<Flashcard[]> {
  if (validCards.length === 0) {
    return [];
  }

  const generationId = crypto.randomUUID();
  const rows = validCards.map((card) => ({
    user_id: userId,
    generation_id: generationId,
    status: "generated" as const,
    cloze: card.cloze,
    word_phrase: card.wordPhrase,
    full_sentence: card.fullSentence,
    definition: card.definition,
    collocation_pattern: card.collocationPattern,
    translation_pl: card.translationPl,
  }));

  const { data, error } = await supabase.from("flashcards").insert(rows).select(FLASHCARD_COLUMNS);
  if (error) {
    throw unavailable();
  }

  const parsedRows = z.array(flashcardRowSchema).safeParse(data);
  if (!parsedRows.success) {
    throw unavailable();
  }

  return parsedRows.data.map(toFlashcard);
}
